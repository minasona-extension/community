import browser from "webextension-polyfill";
import { MinasonaStorage } from "./types";
import { UPDATE_INTERVAL } from "./config";

const DEFAULT_MINASONAS = [
  "Minawan_Blue.avif",
  "Minawan_Blue.webp",
  "Minawan_Green.avif",
  "Minawan_Green.webp",
  "Minawan_Purple.avif",
  "Minawan_Purple.webp",
  "Minawan_Red.avif",
  "Minawan_Red.webp",
  "Minawan_Yellow.avif",
  "Minawan_Yellow.webp",
];

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

    const reducedData: MinasonaStorage = {};
    Object.entries(data).forEach(([communityName, members]) => {
      members.forEach((m) => {
        if (!m.twitchUsername) return;
        const lowerCaseUsername = m.twitchUsername.toLowerCase();
        if (!reducedData[lowerCaseUsername]) {
          reducedData[lowerCaseUsername] = {};
        }
        reducedData[lowerCaseUsername][communityName] = {
          iconUrl: encodeURI(m.avif64 || ""),
          fallbackIconUrl: encodeURI(m.png64 || ""),
          imageUrl: encodeURI(m.avif256 || ""),
          fallbackImageUrl: encodeURI(m.png256 || ""),
        };
      });
    });

    browser.storage.local.set({ minasonaMap: reducedData, lastUpdate: new Date().getTime() });
    console.log(`${new Date().toLocaleTimeString()} Minasona map updated.`);
  } catch (error) {
    console.error(`${new Date().toLocaleTimeString()} Failed to fetch minasonas: `, error);
  }
}

// Update data on install and set up alarm
browser.runtime.onInstalled.addListener(async () => {
  updateMinasonaMap();
  setupAlarm();

  // create data urls for standard minasonas
  const data: string[] = [];

  for (const asset of DEFAULT_MINASONAS) {
    data.push(await getDataURL(asset));
  }

  browser.storage.local.set({ standardMinasonaUrls: data });
});

// Update data on browser startup and set up alarm
browser.runtime.onStartup.addListener(() => {
  updateMinasonaMap();
  setupAlarm();
});

async function getDataURL(asset: string): Promise<string> {
  const url = browser.runtime.getURL(`assets/${asset}`);
  const res = await fetch(url);
  const blob = await res.blob();
  const reader = new FileReader();
  let result = "";
  await new Promise<void>((resolve) => {
    reader.onload = () => {
      result = reader.result as string;
      resolve();
    };
    reader.readAsDataURL(blob);
  });
  return result;
}

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
