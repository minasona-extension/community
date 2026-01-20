import { MAIN_CHANNEL } from "./config";
import { MinasonaStorage, PalsonaEntry } from "./types";
import browser from "webextension-polyfill";

// the mapping of twitch usernames to minasona names and image urls
let minasonaMap: MinasonaStorage = {};
let defaultMinasonaMap: string[] = [];

// the currently observed chat container and its observer
let currentChatContainer: HTMLElement | null = null;
let currentObserver: MutationObserver | null = null;
// the user list for the current chat with the current settings
// this list is used, so we don't have to recalculate which palsona to use each time a user chats
let currentPalsonaList: { [username: string]: PalsonaEntry[] } = {};

// the popover showing the minasona image when clicking the icon
let popoverInstance: HTMLElement = null;

// settings - initialize with defaults
let settingShowInOtherChats = true;
let settingShowForEveryone = false;
let settingShowOtherPalsonas = true;
let settingShowAllPalsonas = false;
let settingIconSize = "32";

applySettings();
fetchMinasonaMap();
startSupervisor();

/**
 * Fetches settings from the browsers storage and applies them to the local variables.
 */
async function applySettings() {
  const result: { showInOtherChats?: boolean; showForEveryone?: boolean; showOtherPalsonas?: boolean; showAllPalsonas?: boolean; iconSize?: string } =
    await browser.storage.sync.get(["showInOtherChats", "showForEveryone", "showOtherPalsonas", "showAllPalsonas", "iconSize"]);

  currentPalsonaList = {};

  if (settingShowInOtherChats != result.showInOtherChats) {
    settingShowInOtherChats = result.showInOtherChats ?? true;
    // reload observer
    if (currentChatContainer) {
      mountObserver(currentChatContainer);
    }
  }

  if (settingShowForEveryone != result.showForEveryone) {
    settingShowForEveryone = result.showForEveryone ?? false;
    if (!settingShowForEveryone) {
      fetchMinasonaMap();
    }
  }

  if (settingShowOtherPalsonas != result.showOtherPalsonas) {
    settingShowOtherPalsonas = result.showOtherPalsonas ?? true;
  }

  if (settingShowAllPalsonas != result.showAllPalsonas) {
    settingShowAllPalsonas = result.showAllPalsonas ?? false;
  }

  if (settingIconSize != result.iconSize) {
    settingIconSize = result.iconSize || "32";
  }
}
// listen for settings changes
browser.storage.onChanged.addListener((_changes, namespace) => {
  if (namespace === "sync") {
    applySettings();
  }
});

/**
 * Gets the minasona mapping from browser storage and starts the supervisor.
 * The mapping is set by the background script and updated once per hour.
 */
async function fetchMinasonaMap() {
  const result: { minasonaMap?: MinasonaStorage; standardMinasonaUrls?: string[] } = await browser.storage.local.get(["minasonaMap", "standardMinasonaUrls"]);

  if (!result) return;
  minasonaMap = result.minasonaMap || {};
  defaultMinasonaMap = result.standardMinasonaUrls || [];
}

/**
 * Starts the supervisor that checks for chat container changes every 5 seconds.
 * When a new chat container is detected, it mounts a new observer on it.
 * Only call this function once.
 */
function startSupervisor() {
  setInterval(() => {
    // get native, 7tv and VOD chat containers

    // seven tv has priority
    const sevenTvChatContainer = document.querySelector<HTMLElement>(".seventv-chat-list");
    if (sevenTvChatContainer) {
      if (currentChatContainer !== sevenTvChatContainer) {
        mountObserver(sevenTvChatContainer);
      }
      return;
    }

    const nativeChatContainer = document.querySelector<HTMLElement>(".chat-scrollable-area__message-container");
    if (nativeChatContainer) {
      if (currentChatContainer !== nativeChatContainer) {
        mountObserver(nativeChatContainer);
      }
      return;
    }

    const vodChatContainer = document.querySelector<HTMLElement>('ul[class^="InjectLayout-sc"]');
    if (vodChatContainer) {
      if (currentChatContainer !== vodChatContainer) {
        mountObserver(vodChatContainer);
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

  // get current channel name from url
  const path = window.location.pathname.toLowerCase();
  const channelName = path.split("/").filter((seg) => seg.length > 0)[0];

  // if setting does not allow other channels -> check if channel is allowed
  if (!settingShowInOtherChats) {
    // check if the current twitch channel is supported
    if (channelName !== MAIN_CHANNEL) {
      return;
    }
  }

  // process existing children
  Array.from(container.children).forEach((node) => processNode(node, channelName));

  // create and start observer
  currentObserver = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      mutation.addedNodes.forEach((node) => {
        processNode(node, channelName);
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
 * Extracts the username element from a chat message element.
 * @param node The chat message element.
 * @returns The username element.
 */
function getUsernameElement(node: HTMLElement): HTMLElement {
  // select any elements where the class contains the word "username" or "author"
  // this is most likely the element the username is in, regardless of other installed addons
  const usernameElement = node.querySelector<HTMLElement>('[class*="username"], [class*="author"]');
  if (!usernameElement) return;
  // check if there's another username element inside the detected element
  // on native this is important to select only the name and not the element containing badges + name
  const innerUsernameEl = usernameElement.querySelector<HTMLElement>('[class*="username"]');

  return innerUsernameEl || usernameElement;
}

/**
 * Processes a node in the chat container.
 * This function checks the username of the author and adds the icon(s) if criteria are met.
 * @param node The added node to process.
 */
function processNode(node: Node, channelName: string) {
  if (!(node instanceof HTMLElement)) return;

  // minasona-icon already appended
  if (node.querySelector<HTMLElement>(".minasona-icon")) return;

  // get username
  const usernameElement = getUsernameElement(node);
  if (!usernameElement) return;
  const username = usernameElement.innerText.toLowerCase();
  if (!username) return;

  if (!currentPalsonaList[username]) {
    // calculate palsonas to display for this user based on current channel and settings
    currentPalsonaList[username] = createPalsonaEntryList(username, channelName);
  }

  // create icon container
  const iconContainer = document.createElement("div");
  iconContainer.classList.add("minasona-icon-container");

  for (const ps of currentPalsonaList[username]) {
    const icon = createPalsonaIcon(ps);
    iconContainer.append(icon);
  }

  // get badge slot to place icon container there if present
  // this is needed to preserve usernames containing color gradients and also the correct display of the pronouns extension
  const badgeSlot = node.querySelector<HTMLElement>(".chat-line__message--badges, .seventv-chat-user-badge-list");
  if (!badgeSlot && usernameElement) {
    // just prepend iconContainer to name
    usernameElement.prepend(iconContainer);
  } else if (badgeSlot) {
    // insert after badge slot
    badgeSlot.append(iconContainer);
  }
}

/**
 * Creates a palsona (priority) list depending on the user settings.
 * @param username The target user.
 * @param channelName The currently watched channel name.
 * @returns The palsona list to display in chat for this user.
 */
function createPalsonaEntryList(username: string, channelName: string): PalsonaEntry[] {
  console.log(`Creating palsona list for ${username}`);
  let palsonas: PalsonaEntry[] = [];

  if (settingShowOtherPalsonas) {
    palsonas = getPalsonaPriorityList(minasonaMap[username], channelName);
  } else {
    palsonas = minasonaMap[username][MAIN_CHANNEL] ? [minasonaMap[username][MAIN_CHANNEL]] : [];
  }

  if (settingShowForEveryone) {
    if (palsonas.length == 0) {
      // user has no palsonas
      const rnd = Math.floor((Math.random() * Object.keys(defaultMinasonaMap).length) / 2) * 2;
      palsonas = [
        {
          iconUrl: defaultMinasonaMap[rnd],
          fallbackIconUrl: defaultMinasonaMap[rnd + 1],
          imageUrl: "",
          fallbackImageUrl: "",
        },
      ];
    }
  }
  if (!settingShowAllPalsonas) {
    palsonas = palsonas[0] ? [palsonas[0]] : [];
  }

  return palsonas;
}

/**
 * Creates a palsona icon for the Twitch chat user and returns the element.
 * @param ps The palsona entry to create the icon for.
 * @returns The icon element.
 */
function createPalsonaIcon(ps: PalsonaEntry): HTMLPictureElement {
  const source = document.createElement("source");
  source.srcset = ps.iconUrl;
  source.type = "image/avif";

  const img = document.createElement("img");
  img.src = ps.fallbackIconUrl;
  img.loading = "lazy";
  img.classList.add("minasona-icon");
  img.style.height = `${settingIconSize || "32"}px`;

  const icon = document.createElement("picture");
  icon.appendChild(source);
  icon.appendChild(img);
  // add popover on click if its not a default minasona
  if (ps.imageUrl) {
    icon.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();

      showMinasonaPopover(e.target as HTMLElement, ps.imageUrl, ps.fallbackImageUrl);
    });
  }

  return icon;
}

/**
 * Determine which palsona to use for this user and channel:
 * 1. Minasona (main channel) image
 * 2. currently watched channel -sona
 * after that all other palsonas present for this user
 *
 * @param userElement The user element from the Minasona storage.
 * @param currentChannelName The currently watched channel name.
 * @returns An array of PalsonaEntrys representing the priority of display.
 */
function getPalsonaPriorityList(userElement: { [communityName: string]: PalsonaEntry }, currentChannelName: string): PalsonaEntry[] {
  if (!userElement || Object.entries(userElement).length == 0) {
    return [{ iconUrl: "", fallbackIconUrl: "", imageUrl: "", fallbackImageUrl: "" }];
  }

  const palsonaPrioList: PalsonaEntry[] = [];
  if (userElement[MAIN_CHANNEL]) {
    palsonaPrioList.push(userElement[MAIN_CHANNEL]);
  }

  if (MAIN_CHANNEL != currentChannelName && userElement[currentChannelName]) {
    palsonaPrioList.push(userElement[currentChannelName]);
  }

  for (const [communityName, entry] of Object.entries(userElement)) {
    if (communityName == MAIN_CHANNEL || communityName == currentChannelName) {
      continue;
    }
    palsonaPrioList.push(entry);
  }
  return palsonaPrioList;
}

/**
 * Gets or creates the popover element for displaying the enlarged minasona image.
 * @returns The popover HTMLElement.
 */
function getOrCreatePopover(): HTMLElement {
  if (!popoverInstance) {
    popoverInstance = document.createElement("div");
    popoverInstance.classList.add("twitch-minasona-popover");

    const loader = document.createElement("div");
    loader.classList.add("loader");
    popoverInstance.appendChild(loader);

    // image elements for avif and png as a fallback
    const source = document.createElement("source");
    source.type = "image/avif";
    const img = document.createElement("img");
    img.loading = "lazy";

    const picture = document.createElement("picture");
    picture.appendChild(source);
    picture.appendChild(img);
    popoverInstance.appendChild(picture);

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
function showMinasonaPopover(minasonaIcon: HTMLElement, imageUrl: string, fallbackImageUrl: string) {
  const popover = getOrCreatePopover();

  const picture = popover.querySelector<HTMLPictureElement>("picture");
  picture.hidden = true;
  const loader = popover.querySelector<HTMLDivElement>(".loader");
  loader.style.display = "block";
  const source = popover.querySelector<HTMLSourceElement>("source");
  const img = popover.querySelector<HTMLImageElement>("img");
  img.classList.remove("loaded");

  preloadImage(imageUrl)
    .then(() => {
      swapPicture(source, imageUrl, img, fallbackImageUrl, loader, picture);
    })
    .catch(() => {
      // fallback to png
      preloadImage(fallbackImageUrl).then(() => {
        swapPicture(source, null, img, fallbackImageUrl, loader, picture);
      });
    });

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
  if (topPos < 0) {
    topPos = rect.bottom + gap;
  }
  popover.style.left = `${leftPos}px`;
  popover.style.top = `${topPos}px`;

  // show popover
  popover.classList.add("active");
}

async function preloadImage(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const i = new Image();
    i.onload = () => resolve();
    i.onerror = () => reject();
    i.src = src;
  });
}

/**
 * Swaps loader with picture element once the image is done loading.
 */
function swapPicture(
  sourceElement: HTMLSourceElement,
  avifSrc: string | null,
  imageElement: HTMLImageElement,
  pngSrc: string,
  loader: HTMLDivElement,
  pictureElement: HTMLPictureElement,
) {
  if (avifSrc) {
    sourceElement.srcset = avifSrc;
  } else {
    sourceElement.srcset = "";
  }
  imageElement.src = pngSrc;

  loader.style.display = "none";
  pictureElement.hidden = false;

  requestAnimationFrame(() => {
    imageElement.classList.add("loaded");
  });
}
