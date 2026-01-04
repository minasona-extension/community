import browser from "webextension-polyfill";

window.browser = browser;

document.addEventListener("DOMContentLoaded", async () => {
  // init states
  const showInOtherChatsCheckbox = document.getElementById("showInOtherChats");
  const showForEveryoneCheckbox = document.getElementById("showForEveryone");

  const iconSize = document.getElementById("iconSize");
  const labelText = document.getElementById("rangeLabel");
  const minasonaIcon = document.querySelector(".minasona-icon");

  const result = await browser.storage.sync.get(["showInOtherChats", "showForEveryone", "iconSize"]);
  showInOtherChatsCheckbox.checked = result.showInOtherChats || false;
  showForEveryoneCheckbox.checked = result.showForEveryone || false;

  iconSize.value = result.iconSize || 32;
  labelText.innerText = `${result.iconSize || 32} Pixels`;
  minasonaIcon.style.height = `${result.iconSize || 32}px`;

  // save new state when user toggles the checkbox
  showInOtherChatsCheckbox.addEventListener("change", () => {
    const isChecked = showInOtherChatsCheckbox.checked;
    // save to storage
    browser.storage.sync.set({ showInOtherChats: isChecked });
  });

  showForEveryoneCheckbox.addEventListener("change", () => {
    const isChecked = showForEveryoneCheckbox.checked;
    browser.storage.sync.set({ showForEveryone: isChecked });
  });

  // icon size slider
  iconSize.addEventListener("input", () => {
    labelText.innerText = `${iconSize.value} Pixels`;
    minasonaIcon.style.height = `${iconSize.value}px`;
  });

  iconSize.addEventListener("change", () => {
    browser.storage.sync.set({ iconSize: iconSize.value });
  });
});
