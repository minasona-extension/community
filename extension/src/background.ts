import browser from "webextension-polyfill";
import { MinasonaStorage } from "./types";

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

// fetches the minasona list from the server and stores it into the local browser storage
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
        if (!reducedData[m.twitchUsername]) {
          reducedData[m.twitchUsername] = {};
        }
        reducedData[m.twitchUsername][communityName] = {
          iconUrl: encodeURI(m.avif64),
          fallbackIconUrl: encodeURI(m.png64),
          imageUrl: encodeURI(m.avif256),
          fallbackImageUrl: encodeURI(m.png256),
        };
      });
    });

    browser.storage.local.set({ minasonaMap: reducedData });
    console.log(`${new Date().toLocaleTimeString()} Minasona map updated.`);
  } catch (error) {
    console.error(`${new Date().toLocaleTimeString()} Failed to fetch minasonas: `, error);
  }
}

// update on install and then every 60 mins
browser.runtime.onInstalled.addListener(async () => {
  updateMinasonaMap();
  browser.alarms.create("refreshMinasonas", { periodInMinutes: 60 });

  // create data urls for standard minasonas
  const data: string[] = [];

  for (const asset of DEFAULT_MINASONAS) {
    const url = browser.runtime.getURL(`assets/${asset}`);
    const res = await fetch(url);
    const blob = await res.blob();
    const reader = new FileReader();
    await new Promise<void>((resolve) => {
      reader.onload = () => {
        data.push(reader.result as string);
        resolve();
      };
      reader.readAsDataURL(blob);
    });
  }

  browser.storage.local.set({ standardMinasonaUrls: data });
});

browser.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "refreshMinasonas") {
    updateMinasonaMap();
  }
});
