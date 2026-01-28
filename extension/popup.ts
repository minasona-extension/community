import browser from "webextension-polyfill";
import { managerEntry } from "./src/types";

document.addEventListener("DOMContentLoaded", main);

async function main() {
  // init states
  const showInOtherChatsCheckbox = document.getElementById("showInOtherChats") as HTMLInputElement;

  const result: { showInOtherChats?: boolean; palsonaManagerList?: managerEntry[]; palsonaLimit?: string; iconSize?: string } = await browser.storage.sync.get([
    "showInOtherChats",
    "palsonaManagerList",
    "palsonaLimit",
    "iconSize",
  ]);
  // checkbox other chats
  showInOtherChatsCheckbox.checked = result.showInOtherChats ?? true;

  // save new state when user toggles the checkbox
  showInOtherChatsCheckbox.addEventListener("change", () => {
    const isChecked = showInOtherChatsCheckbox.checked;
    // save to storage
    browser.storage.sync.set({ showInOtherChats: isChecked });
  });

  handlePalsonaManager(result.palsonaManagerList);
  handleAmountSlider(parseInt(result.palsonaLimit));
  handleSizeSlider(parseInt(result.iconSize));
  updateTwitchPreview();

  const lastUpdateResult: { lastUpdate?: string } = await browser.storage.local.get(["lastUpdate"]);
  const lastUpdateElement = document.getElementById("lastUpdate");

  if (lastUpdateElement && lastUpdateResult && lastUpdateResult.lastUpdate) {
    lastUpdateElement.innerText = new Date(lastUpdateResult.lastUpdate).toLocaleString();
  }
}

function handlePalsonaManager(managerList: managerEntry[]) {
  const initManagerList = managerList || [
    { dataId: "main-channel", enabled: true },
    { dataId: "current-channel", enabled: true },
    { dataId: "other-channels", enabled: false },
    { dataId: "default-minasona", enabled: false },
  ];
  // init state
  const managerElement = document.getElementById("palsona-manager") as HTMLDivElement;
  const channelItems = managerElement.querySelectorAll<HTMLDivElement>(".draggable-item");
  managerElement.childNodes.forEach((child) => {
    child.remove();
  });

  for (const entry of initManagerList) {
    const currentChannelItem = Array.from(channelItems).find((item) => {
      return item.dataset.id === entry.dataId;
    });
    const checkbox = currentChannelItem.querySelector("input");
    checkbox.checked = entry.enabled;
    managerElement.append(currentChannelItem);
  }

  // drag & drop
  let dragSrcEl = null;

  managerElement.addEventListener("dragstart", (e) => {
    if ((e.target as HTMLElement).className === "draggable-item") {
      dragSrcEl = e.target;
      e.dataTransfer.effectAllowed = "move";
    }
  });

  managerElement.addEventListener("dragover", (e) => {
    e.preventDefault();
    return false;
  });

  managerElement.addEventListener("drop", (e) => {
    e.preventDefault();
    const target = (e.target as HTMLElement).closest(".draggable-item");

    if (target && target !== dragSrcEl) {
      const rect = target.getBoundingClientRect();
      const next = (e.clientY - rect.top) / (rect.bottom - rect.top) > 0.5;
      managerElement.insertBefore(dragSrcEl, next ? target.nextSibling : target);
      savePalsonaManagerList(managerElement);
      updateTwitchPreview();
    }
  });

  const checkboxes = managerElement.querySelectorAll("input");
  checkboxes.forEach((checkbox) => {
    checkbox.addEventListener("change", () => {
      savePalsonaManagerList(managerElement);
      updateTwitchPreview();
    });
  });
}

async function savePalsonaManagerList(managerElement: HTMLDivElement) {
  const channelItems = managerElement.querySelectorAll<HTMLDivElement>(".draggable-item");
  const palsonaSaveList: managerEntry[] = Array.from(channelItems).map((item) => {
    return { dataId: item.dataset.id, enabled: item.querySelector("input")?.checked };
  });
  await browser.storage.sync.set({ palsonaManagerList: palsonaSaveList });
}

function handleAmountSlider(palsonaLimit: number) {
  const palsonaAmount = document.getElementById("palsonaAmount") as HTMLInputElement;
  const labelText = document.getElementById("amountLabel") as HTMLSpanElement;
  const minasonaIcons = document.querySelectorAll<HTMLImageElement>(".minasona-preview-icon");

  palsonaAmount.value = (palsonaLimit || 2).toString();
  labelText.innerText = `${palsonaLimit || 2} Palsonas`;
  for (let i = 0; i < minasonaIcons.length; i++) {
    minasonaIcons[i].style.display = i < palsonaLimit ? "inline-block" : "none";
  }

  palsonaAmount.addEventListener("input", () => {
    labelText.innerText = `${palsonaAmount.value} Palsona${parseInt(palsonaAmount.value) > 1 ? "s" : ""}`;
    updateTwitchPreview();
  });

  palsonaAmount.addEventListener("change", () => {
    browser.storage.sync.set({ palsonaLimit: palsonaAmount.value });
  });
}

function handleSizeSlider(iconSizeVal: number) {
  const iconSize = document.getElementById("iconSize") as HTMLInputElement;
  const labelText = document.getElementById("rangeLabel") as HTMLSpanElement;
  const minasonaIcons = document.querySelectorAll<HTMLImageElement>(".minasona-preview-icon");

  iconSize.value = (iconSizeVal || 32).toString();
  labelText.innerText = `${iconSizeVal || 32} Pixels`;
  minasonaIcons.forEach((icon) => {
    icon.style.height = `${iconSizeVal || 32}px`;
  });

  iconSize.addEventListener("input", () => {
    labelText.innerText = `${iconSize.value} Pixels`;
    minasonaIcons.forEach((icon) => {
      icon.style.height = `${iconSize.value}px`;
    });
  });

  iconSize.addEventListener("change", () => {
    browser.storage.sync.set({ iconSize: iconSize.value });
  });
}

function updateTwitchPreview() {
  const minasonaIcons = document.querySelectorAll<HTMLImageElement>(".minasona-preview-icon");
  const channelItems = document.querySelectorAll<HTMLDivElement>(".draggable-item");
  const palsonaAmount = document.getElementById("palsonaAmount") as HTMLInputElement;
  const palsonaAmountVal = parseInt(palsonaAmount.value);

  let iconIndex = 0;
  channelItems.forEach((item) => {
    const checked = item.querySelector("input")?.checked;
    if (!checked || iconIndex >= minasonaIcons.length || iconIndex >= palsonaAmountVal || (iconIndex > 0 && item.dataset.id === "default-minasona")) return;
    minasonaIcons[iconIndex].style.display = "inline-block";
    minasonaIcons[iconIndex].src = getIconSrc(item.dataset.id);
    iconIndex++;
  });
  for (let i = iconIndex; i < minasonaIcons.length; i++) {
    minasonaIcons[iconIndex].style.display = "none";
    minasonaIcons[i].src = "";
  }
}

function getIconSrc(dataId: string): string {
  switch (dataId) {
    case "main-channel":
      return "assets/Cerby_64x64.png";
    case "current-channel":
      return "assets/wormpal.png";
    case "other-channels":
      return "assets/Ditto.png";
    case "default-minasona":
      return "assets/Minawan_Purple.webp";
  }
}
