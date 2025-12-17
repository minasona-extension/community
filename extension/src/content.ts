import { MinasonaMap, MinasonaStorage } from "./types";

const API_URL = "https://arcade.minawan.dog/public/minasonas";
const ALLOWED_CHANNEL = "cerbervt";
const DEFAULT_MINASONAS = [
  "https://firebasestorage.googleapis.com/v0/b/minasona-twitch-extension.firebasestorage.app/o/Minawan_Yellow_72x72.webp?alt=media&token=37f8341c-c407-48a3-a2d3-09b62c1f4fef",
  "https://firebasestorage.googleapis.com/v0/b/minasona-twitch-extension.firebasestorage.app/o/Minawan_Red_72x72.webp?alt=media&token=75aaa4ac-7f6b-4a39-9ba5-2a00ae6036f2",
  "https://firebasestorage.googleapis.com/v0/b/minasona-twitch-extension.firebasestorage.app/o/Minawan_Purple_72x72.webp?alt=media&token=5c83366e-213c-4712-8ee8-cbd32a5b67f8",
  "https://firebasestorage.googleapis.com/v0/b/minasona-twitch-extension.firebasestorage.app/o/Minawan_Green_72x72.webp?alt=media&token=43412b57-7e28-4008-bda9-52449402851f",
  "https://firebasestorage.googleapis.com/v0/b/minasona-twitch-extension.firebasestorage.app/o/Minawan_Blue_72x72.webp?alt=media&token=af86f8cf-600f-4cab-832c-48fbf19b3f48",
];

// the mapping of twitch usernames to minasona names and image urls
let minasonaMap: MinasonaMap = {};

// the currently observed chat container and its observer
let currentChatContainer: HTMLElement | null = null;
let currentObserver: MutationObserver | null = null;

// the popover showing the minasona image when clicking the icon
let popoverInstance: HTMLElement = null;

// settings
let settingShowInOtherChats = false;
let settingShowForEveryone = false;
let settingIconSize = "32";

applySettings();
fetchMinasonaMap();
startSupervisor();

/**
 * Gets the minasona mapping from browser storage and starts the supervisor.
 * The mapping is set by the background script and updated once per hour.
 * todo: get regularly not just once
 */
function fetchMinasonaMap() {
  chrome.storage.local.get(["minasonaMap"], (result: { minasonaMap?: MinasonaStorage }) => {
    if (result.minasonaMap) {
      for (const twitchName in result.minasonaMap) {
        const minasonaName = result.minasonaMap[twitchName];
        minasonaMap[twitchName] = { minasonaName: minasonaName, iconUrl: `${API_URL}/${minasonaName}.webp`, imageUrl: `${API_URL}/${minasonaName}.webp` };
      }
    }
  });
}

/**
 * Fetches settings from the browsers storage and applies them to the local variables.
 */
function applySettings() {
  chrome.storage.sync.get(
    ["showInOtherChats", "showForEveryone", "iconSize"],
    (result: { showInOtherChats: boolean; showForEveryone: boolean; iconSize: string }) => {
      if (settingShowInOtherChats != result.showInOtherChats) {
        settingShowInOtherChats = result.showInOtherChats || false;
        // reload observer
        if (currentChatContainer) {
          mountObserver(currentChatContainer);
        }
      }

      if (settingShowForEveryone != result.showForEveryone) {
        settingShowForEveryone = result.showForEveryone || false;
        if (!settingShowForEveryone) {
          minasonaMap = {};
          fetchMinasonaMap();
        }
      }

      if (settingIconSize != result.iconSize) {
        settingIconSize = result.iconSize || "32";
      }
    },
  );
}
// listen for settings changes
chrome.storage.onChanged.addListener((_changes, namespace) => {
  if (namespace === "sync") {
    applySettings();
  }
});

/**
 * Starts the supervisor that checks for chat container changes every 5 seconds.
 * When a new chat container is detected, it mounts a new observer on it.
 * Only call this function once.
 */
function startSupervisor() {
  setInterval(() => {
    // get native and 7tv chat containers
    const nativeChatContainer = document.querySelector<HTMLElement>(".chat-scrollable-area__message-container");
    const sevenTvChatContainer = document.querySelector<HTMLElement>(".seventv-chat-list");

    // seven tv has priority
    if (sevenTvChatContainer) {
      if (currentChatContainer !== sevenTvChatContainer) {
        mountObserver(sevenTvChatContainer);
      }
      return;
    }

    if (nativeChatContainer) {
      if (currentChatContainer !== nativeChatContainer) {
        mountObserver(nativeChatContainer);
      }
      return;
    }

    // check if current container is removed from DOM
    if (currentChatContainer && !document.body.contains(currentChatContainer)) {
      disconnectObserver();
    }
  }, 5000);
}

/**
 * Mounts a mutation observer on the given chat container to monitor new chat messages.
 * @param container The chat container element to observe.
 */
function mountObserver(container: HTMLElement) {
  disconnectObserver();

  currentChatContainer = container;

  // if setting does not allow other channels -> check if channel is in allowed list
  if (!settingShowInOtherChats) {
    // check if the current twitch channel is supported
    const path = window.location.pathname.toLowerCase();
    if (ALLOWED_CHANNEL !== path.split("/").filter((seg) => seg.length > 0)[0]) {
      return;
    }
  }

  // process existing children
  Array.from(container.children).forEach((node) => processNode(node));

  // create and start observer
  currentObserver = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      mutation.addedNodes.forEach((node) => {
        processNode(node);
      });
    });
  });

  currentObserver.observe(container, { childList: true, subtree: true });
}

/**
 * Disconnects the current observer from the chat container, if any.
 */
function disconnectObserver() {
  if (currentObserver) {
    currentObserver.disconnect();
    currentObserver = null;
  }
  currentChatContainer = null;
}

/**
 * Processes a newly added node in the chat container.
 * @param node The added node to process.
 */
function processNode(node: Node) {
  if (!(node instanceof HTMLElement)) return;

  // get username elements for native and 7tv chat
  const nativeUsernameEl = node.querySelector<HTMLElement>(".chat-line__username-container");
  const sevenTvUsernameEl = node.querySelector<HTMLElement>(".seventv-chat-user");

  // no username element found
  if (!nativeUsernameEl && !sevenTvUsernameEl) return;
  // minasona-icon already appended
  if ((sevenTvUsernameEl || nativeUsernameEl).querySelector<HTMLElement>(".minasona-icon")) return;

  const username = (sevenTvUsernameEl || nativeUsernameEl).innerText.toLowerCase();
  // username not in existing minasonas
  if (!minasonaMap[username]) {
    if (!settingShowForEveryone) return;
    // add uncustomized minasona
    const rnd = Math.floor(Math.random() * DEFAULT_MINASONAS.length);
    minasonaMap[username] = { minasonaName: "", iconUrl: DEFAULT_MINASONAS[rnd], imageUrl: "" };
  }

  // create icon
  const icon = document.createElement("img");
  icon.src = minasonaMap[username].iconUrl;
  icon.classList.add("minasona-icon");
  icon.style.height = `${settingIconSize || "32"}px`;
  // add popover on click if its not a default minasona
  if (minasonaMap[username].imageUrl) {
    icon.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();

      showMinasonaPopover(e.target as HTMLElement, minasonaMap[username].minasonaName, minasonaMap[username].imageUrl);
    });
  }

  // create icon container
  const iconContainer = document.createElement("div");
  iconContainer.classList.add("minasona-icon-container");
  iconContainer.title = "Minasona";
  iconContainer.append(icon);

  if (sevenTvUsernameEl) {
    // check if badge div is present
    const badgeListElement = sevenTvUsernameEl.querySelector<HTMLElement>(".seventv-chat-user-badge-list");
    if (badgeListElement) {
      // badge list exists -> just append the icon container
      iconContainer.style.marginLeft = "2px";
      badgeListElement.append(iconContainer);
      return;
    }
    // badge list does not exist -> create badge list and prepend to username element
    const newBadgeListElement = document.createElement("div");
    newBadgeListElement.classList.add("seventv-chat-user-badge-list");
    newBadgeListElement.style.display = "inline-flex";
    newBadgeListElement.style.verticalAlign = "middle";
    newBadgeListElement.style.marginRight = "4px";
    newBadgeListElement.append(iconContainer);
    sevenTvUsernameEl.prepend(newBadgeListElement);
    return;
  }

  if (nativeUsernameEl) {
    // check if badge span is present
    const badgeListElement = nativeUsernameEl.querySelector<HTMLElement>("span > div > button[data-a-target='chat-badge']");
    iconContainer.style.marginRight = "4px";
    if (badgeListElement) {
      // badge span exists -> just append the icon container
      badgeListElement.parentElement.parentElement.append(iconContainer);
      return;
    }
    // badge span does not exist -> create badge span and prepend to username element
    const newBadgeListElement = document.createElement("span");
    newBadgeListElement.append(iconContainer);
    nativeUsernameEl.prepend(newBadgeListElement);
    return;
  }
}

/**
 * Gets or creates the popover element for displaying the enlarged minasona image.
 * @returns The popover HTMLElement.
 */
function getOrCreatePopover(): HTMLElement {
  if (!popoverInstance) {
    popoverInstance = document.createElement("div");
    popoverInstance.classList.add("twitch-minasona-popover");

    // title to show the minasonas name
    const title = document.createElement("div");
    title.classList.add("minasona-name");
    popoverInstance.appendChild(title);

    const img = document.createElement("img");
    popoverInstance.appendChild(img);

    document.body.append(popoverInstance);

    // logic to close popover when clicking outside
    document.addEventListener("click", (e) => {
      if (popoverInstance.classList.contains("active") && !popoverInstance.contains(e.target as HTMLElement)) {
        popoverInstance.classList.remove("active");
      }
    });
  }
  return popoverInstance;
}

/**
 * Shows the minasona popover above to the given icon element.
 * @param minasonaIcon The parent icon element to position the popover above.
 * @param minasonaName The name of the minasona to display.
 * @param imageUrl The image URL of the minasona to display.
 */
function showMinasonaPopover(minasonaIcon: HTMLElement, minasonaName: string, imageUrl: string) {
  const popover = getOrCreatePopover();
  const title = popover.querySelector<HTMLDivElement>(".minasona-name");
  title.innerText = minasonaName;
  const img = popover.querySelector<HTMLImageElement>("img");
  img.src = imageUrl;

  // get popover dimensions
  const popoverRect = popover.getBoundingClientRect();
  const popWidth = popoverRect.width;
  const popHeight = popoverRect.height;
  const gap = 10;

  // get bounding box / position of parent
  const rect = minasonaIcon.getBoundingClientRect();
  // calc position for popover
  let leftPos = rect.left + rect.width / 2 - popWidth / 2;
  let topPos = rect.top - popHeight - gap;
  popover.style.left = `${leftPos}px`;
  popover.style.top = `${topPos}px`;

  // show popover
  popover.classList.add("active");
}
