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
    const response = await fetch(`https://minawan.me/gallery.json`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
    });
    const data: { twitchUsername?: string; minasonaAvif64: string; minasonaPng64: string; minasonaAvif256: string; minasonaPng256: string }[] =
      await response.json();

    const reducedData: MinasonaStorage = {};
    data.forEach((d) => {
      if (!d.twitchUsername) return;
      reducedData[d.twitchUsername] = {
        iconUrl: d.minasonaAvif64,
        fallbackIconUrl: d.minasonaPng64,
        imageUrl: d.minasonaAvif256,
        fallbackImageUrl: d.minasonaPng256,
      };
    });

    browser.storage.local.set({ minasonaMap: reducedData });
    console.log("Minasona map updated");
  } catch (error) {
    console.error("Failed to fetch minasonas: ", error);
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
