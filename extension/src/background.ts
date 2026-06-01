import browser from "webextension-polyfill";
import { UPDATE_INTERVAL } from "./config";

/**
 * Fetches the user list from the server and stores it into the local browser storage.
 */
async function updateYourUserMap() {
  //todo fetch your user list from your endpoint and store it in the browsers storage
  // remember to update the manifest files to allow your url
}

// Update data on install and set up alarm
browser.runtime.onInstalled.addListener(async () => {
  updateYourUserMap();
  setupAlarm();
});

// Update data on browser startup and set up alarm
browser.runtime.onStartup.addListener(() => {
  updateYourUserMap();
  setupAlarm();
});

browser.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "refreshAlarm") {
    updateYourUserMap();
  }
});

/**
 * Create an alarm (if not existing) for refreshing the minasona data from the API.
 */
async function setupAlarm() {
  const alarm = await browser.alarms.get("refreshAlarm");
  if (!alarm) {
    browser.alarms.create("refreshAlarm", { periodInMinutes: UPDATE_INTERVAL });
  }
}
