import browser from "webextension-polyfill";
import { communityData, MinasonaStorage } from "./types";
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
    const data: Record<string, { twitchUsername?: string; avif64?: string; png64?: string; avif256?: string; png256?: string }[]> = await response.json();
    const communityResponse = await fetch(`https://storage.googleapis.com/minawan-pics.firebasestorage.app/meta.json`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
    });
    const communityData: { channels: Record<string, communityData> } = await communityResponse.json();

    const reducedData: MinasonaStorage = {};
    Object.entries(data).forEach(([communityName, members]) => {
      members.forEach((m) => {
        if (!m.twitchUsername) return;
        const lowerCaseUsername = m.twitchUsername.toLowerCase();
        if (!reducedData[lowerCaseUsername]) {
          reducedData[lowerCaseUsername] = {};
        }
        reducedData[lowerCaseUsername][communityName] = {
          communityName: communityName,
          iconUrl: isAllowedUrl(m.avif64) ? encodeURI(m.avif64 || "") : "",
          fallbackIconUrl: isAllowedUrl(m.png64) ? encodeURI(m.png64 || "") : "",
          imageUrl: isAllowedUrl(m.avif256) ? encodeURI(m.avif256 || "") : "",
          fallbackImageUrl: isAllowedUrl(m.png256) ? encodeURI(m.png256 || "") : "",
        };
      });
    });

    browser.storage.local.set({ minasonaMap: reducedData, lastUpdate: new Date().getTime(), communities: communityData.channels });
    console.log(`${new Date().toLocaleTimeString()} Minasona map updated.`);
  } catch (error) {
    console.error(`${new Date().toLocaleTimeString()} Failed to fetch minasonas: `, error);
  }
}

/**
 * Checks whether an image URL is allowed.
 */
function isAllowedUrl(url: string): boolean {
  if (!url) return true; // empty URLs are ok
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" && parsed.hostname === "storage.googleapis.com" && parsed.pathname.startsWith("/minawan-pics");
  } catch {
    return false;
  }
}

// Update data on install and set up alarm
browser.runtime.onInstalled.addListener(async () => {
  updateMinasonaMap();
  setupAlarm();
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
