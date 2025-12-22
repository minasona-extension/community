import browser from "webextension-polyfill";
import { MinasonaStorage } from "./types";

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
    reducedData["hellping219"] = {
      iconUrl: "https://storage.googleapis.com/minawan-pics.firebasestorage.app/minawan-backfill/Cerby_64x64.avif",
      fallbackIconUrl: "https://storage.googleapis.com/minawan-pics.firebasestorage.app/minawan-backfill/Cerby_64x64.png",
      imageUrl: "https://storage.googleapis.com/minawan-pics.firebasestorage.app/minawan-backfill/Cerby_256x256.avif",
      fallbackImageUrl: "https://storage.googleapis.com/minawan-pics.firebasestorage.app/minawan-backfill/Cerby_256x256.png",
    };

    browser.storage.local.set({ minasonaMap: reducedData });
    console.log("Minasona map updated");
  } catch (error) {
    console.error("Failed to fetch minasonas: ", error);
  }
}

// update on install and then every 60 mins
browser.runtime.onInstalled.addListener(() => {
  updateMinasonaMap();
  browser.alarms.create("refreshMinasonas", { periodInMinutes: 60 });
});

browser.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "refreshMinasonas") {
    updateMinasonaMap();
  }
});
