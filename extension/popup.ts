import browser from "webextension-polyfill";
import { managerEntry } from "./src/types";
import { getCommunityName, getIconSrc } from "./src/config";

document.addEventListener("DOMContentLoaded", main);

async function main() {
  // init states
  const result: { disabled?: boolean; palsonaManagerList?: managerEntry[]; palsonaLimit?: string; iconSize?: string } = await browser.storage.sync.get([
    "disabled",
    "palsonaManagerList",
    "palsonaLimit",
    "iconSize",
  ]);
  const communityResult: { communities?: string[] } = await browser.storage.local.get(["communities"]);

  handlePalsonaManager(result.palsonaManagerList, communityResult.communities);
  handleAmountSlider(parseInt(result.palsonaLimit));
  handleSizeSlider(parseInt(result.iconSize));
  updateTwitchPreview();

  const lastUpdateResult: { lastUpdate?: string } = await browser.storage.local.get(["lastUpdate"]);
  const lastUpdateElement = document.getElementById("lastUpdate");

  if (lastUpdateElement && lastUpdateResult && lastUpdateResult.lastUpdate) {
    lastUpdateElement.innerText = new Date(lastUpdateResult.lastUpdate).toLocaleString();
  }

  if (result.disabled) {
    disableSettingsPage();
  }
}

function disableSettingsPage() {
  const disableScreen = document.getElementById("disable-screen") as HTMLDivElement;
  disableScreen.style.display = "flex";
}

/**
 * Check the managerList and remove any items where the dataId is not present in the communities array.
 * Then append any community which is not in the managerList to the end and enable them.
 * @param managerList
 * @param communities
 * @returns
 */
function createCurrentManagerList(managerList: managerEntry[], communities: string[]): managerEntry[] {
  if (!managerList) {
    return [
      { dataId: "current-channel", enabled: true },
      ...communities.map((community) => {
        return { dataId: community, enabled: true };
      }),
    ];
  }

  // remove items that are no longer in communities
  const cleanedManagerList = managerList.filter((entry) => entry.dataId === "current-channel" || communities.includes(entry.dataId));

  // find communities that aren't in the managerlist
  const existingCommunities = managerList.map((entry) => entry.dataId);
  const newEntries: managerEntry[] = communities.filter((com) => !existingCommunities.includes(com)).map((com) => ({ dataId: com, enabled: true }));

  return [...cleanedManagerList, ...newEntries];
}

function handlePalsonaManager(managerList: managerEntry[], communities: string[]) {
  const cleanedManagerList = createCurrentManagerList(managerList, communities || []);

  // init state
  const managerElement = document.getElementById("palsona-manager") as HTMLDivElement;

  for (const entry of cleanedManagerList) {
    // create channel item here
    const currentChannelItem = document.createElement("div");
    currentChannelItem.classList.add("draggable-item");
    currentChannelItem.draggable = true;
    currentChannelItem.dataset.id = entry.dataId;

    const label = document.createElement("label");
    label.classList.add("option-label");
    label.title = "Palsona for the currently watched channel";
    currentChannelItem.append(label);

    const dragImg = document.createElement("img");
    dragImg.style.height = "24px";
    dragImg.style.cursor = "grab";
    dragImg.style.fill = "white";
    dragImg.draggable = false;
    dragImg.src = "assets/drag-handle-svgrepo-com.svg";
    label.append(dragImg);

    const input = document.createElement("input");
    input.type = "checkbox";
    input.checked = entry.enabled;
    label.append(input);

    const span = document.createElement("span");
    span.innerText = getCommunityName(entry.dataId);
    if (entry.dataId !== "current-channel") {
      span.title = `${entry.dataId}'s community`;
    }
    label.append(span);

    const palsonaImage = document.createElement("img");
    palsonaImage.classList.add("minasona-icon");
    palsonaImage.draggable = false;
    palsonaImage.src = getIconSrc(entry.dataId);
    span.prepend(palsonaImage);

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

  palsonaAmount.value = (palsonaLimit || 3).toString();
  labelText.innerText = `${palsonaLimit || 3} Palsonas`;
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
