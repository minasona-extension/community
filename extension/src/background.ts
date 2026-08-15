import browser from "webextension-polyfill";
import { communityData, managerEntry, MinasonaStorage } from "./types";
import { UPDATE_INTERVAL } from "./config";

/**
 * Fetches the Palsona list from the server and stores it into the local browser storage.
 */
async function updateMinasonaMap() {
  try {
    const response = await fetch(`https://storage.googleapis.com/minawan-pics.firebasestorage.app/api.json`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const data: Record<string, { twitchUsername?: string; avif64?: string; png64?: string; avif256?: string; png256?: string; backfill?: boolean }[]> =
      await response.json();
    const communityResponse = await fetch(`https://storage.googleapis.com/minawan-pics.firebasestorage.app/meta.json`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
    });
    if (!communityResponse.ok) {
      throw new Error(`HTTP ${communityResponse.status}`);
    }
    const communityData: { channels: Record<string, communityData> } = await communityResponse.json();

    const reducedData: MinasonaStorage = {};
    Object.entries(data).forEach(([communityName, members]) => {
      if (!communityData.channels[communityName]) return;
      members.forEach((m) => {
        if (!m.twitchUsername) return;
        const lowerCaseUsername = m.twitchUsername.toLowerCase();
        if (!reducedData[lowerCaseUsername]) {
          reducedData[lowerCaseUsername] = {};
        }
        if (reducedData[lowerCaseUsername][communityName] && m.backfill) return;
        reducedData[lowerCaseUsername][communityName] = {
          communityName: communityName,
          iconUrl: getAllowedUrl(m.avif64),
          fallbackIconUrl: getAllowedUrl(m.png64),
          imageUrl: getAllowedUrl(m.avif256),
          fallbackImageUrl: getAllowedUrl(m.png256),
          backfill: m.backfill ?? false,
        };
      });
    });

    await browser.storage.local.set({ minasonaMap: reducedData, lastUpdate: new Date().getTime(), communities: communityData.channels });
    console.log(`${new Date().toLocaleTimeString()} Minasona map updated.`);

    const finalManagerList = await createCurrentManagerList(communityData.channels);
    await browser.storage.sync.set({ palsonaManagerList: finalManagerList });
    console.log(`${new Date().toLocaleTimeString()} Palsona manager updated.`);
  } catch (error) {
    console.error(`${new Date().toLocaleTimeString()} Failed to fetch minasonas: `, error);
  }
}

/**
 * Check the managerList and remove any items where the dataId is not present in the communities array.
 * Then append any community which is not in the managerList to the end and enable them.
 * @param communities A list of all enabled communities.
 * @returns
 */
async function createCurrentManagerList(communities: Record<string, communityData>): Promise<managerEntry[]> {
  const result: { palsonaManagerList?: managerEntry[] } = await browser.storage.sync.get(["palsonaManagerList"]);
  let pml = result.palsonaManagerList;

  // handle if manager list is undefined or empty
  if (!pml || pml.length === 0) {
    return [
      { dataId: "current-channel", enabled: true },
      ...Object.keys(communities).map((community) => {
        return { dataId: community, enabled: true };
      }),
    ];
  }

  // handle if current-channel is missing for some reason
  if (!pml.find((v) => v.dataId === "current-channel")) {
    pml = [{ dataId: "current-channel", enabled: true }, ...pml];
  }

  // remove items that are no longer in communities
  const cleanedManagerList = pml.filter((entry) => entry.dataId === "current-channel" || Object.keys(communities).includes(entry.dataId));

  // find communities that aren't in the manager list
  const existingCommunities = pml.map((entry) => entry.dataId);
  const newEntries: managerEntry[] = Object.keys(communities)
    .filter((com) => !existingCommunities.includes(com))
    .map((com) => ({ dataId: com, enabled: true }));

  return [...cleanedManagerList, ...newEntries];
}

/**
 * Checks whether an image URL is allowed.
 */
function getAllowedUrl(url: string | undefined): string {
  if (!url) return ""; // empty URLs are ok
  try {
    const parsed = new URL(url);
    if (parsed.protocol === "https:" && parsed.hostname === "storage.googleapis.com" && parsed.pathname.startsWith("/minawan-pics")) return parsed.toString();
    return "";
  } catch {
    return "";
  }
}

// Update data on install and set up alarm
browser.runtime.onInstalled.addListener(async (details) => {
  await updateMinasonaMap();
  setupAlarm();

  // open options page once after install
  if (details.reason === "install") {
    try {
      await browser.action.openPopup();
    } catch (error) {
      console.error("Failed to open the settings popup:", error);
    }
  }
});

// Update data on browser startup and set up alarm
browser.runtime.onStartup.addListener(() => {
  updateMinasonaMap();
  setupAlarm();
});

browser.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "refreshMinasonas") {
    updateMinasonaMap();
  }
});

/**
 * Create an alarm (if not existing) for refreshing the minasona data from the API.
 */
async function setupAlarm() {
  const alarm = await browser.alarms.get("refreshMinasonas");
  if (!alarm) {
    browser.alarms.create("refreshMinasonas", { periodInMinutes: UPDATE_INTERVAL });
  }
}
