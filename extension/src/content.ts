import { getCommunityName, UPDATE_INTERVAL } from "./config";
import { showMinasonaPopover } from "./minasona-popover";
import { managerEntry, MinasonaStorage, PalsonaEntry } from "./types";
import browser from "webextension-polyfill";

let thisExtensionDisabled = false;
handleMinasonaExtension();

// the mapping of twitch usernames to minasona names and image urls
let minasonaMap: MinasonaStorage = {};

// the currently observed chat container and its observer
let currentChatContainer: HTMLElement | null = null;
let currentObserver: MutationObserver | null = null;
// the user list for the current chat with the current settings
// this list is used, so we don't have to recalculate which palsona to use each time a user chats
let currentPalsonaList: { [username: string]: PalsonaEntry[] } = {};

// settings - initialize with defaults
let settingPalsonaManagerList: managerEntry[] = [{ dataId: "current-channel", enabled: true }];
let settingPalsonaLimit = "3";
let settingIconSize = "32";

applySettings();
fetchMinasonaMap();
startSupervisor();

setInterval(fetchMinasonaMap, UPDATE_INTERVAL * 60 * 1000);

/**
 * Fetches settings from the browsers storage and applies them to the local variables.
 */
async function applySettings() {
  const result: { palsonaManagerList?: managerEntry[]; palsonaLimit?: string; iconSize?: string } = await browser.storage.sync.get([
    "palsonaManagerList",
    "palsonaLimit",
    "iconSize",
  ]);
  const communityResponse: { communities?: string[] } = await browser.storage.local.get(["communities"]);
  const communities = communityResponse.communities || [];

  if (settingPalsonaManagerList != result.palsonaManagerList) {
    settingPalsonaManagerList = result.palsonaManagerList ?? [
      { dataId: "current-channel", enabled: true },
      ...communities.map((community) => {
        return { dataId: community, enabled: true };
      }),
    ];
  }

  if (settingPalsonaLimit != result.palsonaLimit) {
    settingPalsonaLimit = result.palsonaLimit || "3";
  }

  if (settingIconSize != result.iconSize) {
    settingIconSize = result.iconSize || "32";
  }

  // reset current lookup list because settings changed and it needs to be regenerated
  currentPalsonaList = {};
}
// listen for settings changes
browser.storage.onChanged.addListener((_changes, namespace) => {
  if (namespace === "sync") {
    applySettings();
  }
});

/**
 * Gets the minasona mapping from browser storage.
 * The mapping is set by the background script and updated every UPDATE_INTERVAL mins.
 */
async function fetchMinasonaMap() {
  const result: { minasonaMap?: MinasonaStorage } = await browser.storage.local.get(["minasonaMap"]);

  if (!result) return;
  minasonaMap = result.minasonaMap || {};
  currentPalsonaList = {};
  console.log(`${new Date().toLocaleTimeString()}: Updated palsona map and reset current lookup list.`);
}

async function handleMinasonaExtension() {
  await browser.storage.sync.set({ disabled: false });
  thisExtensionDisabled = false;

  // listen for custom event from minasona extension
  document.addEventListener("MINASONA_EXTENSION_ENABLED", () => {
    console.warn("Disabling community palsona extension because minasona extension is enabled!");
    disableThisExtension();
  });
}

function isMinasonaExtensionEnabled(): boolean {
  if (document.querySelector<HTMLElement>(".minasona-icon")) {
    return true;
  }
  return false;
}

async function disableThisExtension() {
  thisExtensionDisabled = true;
  await browser.storage.sync.set({ disabled: true });
}

/**
 * Starts the supervisor that checks for chat container changes every 5 seconds.
 * When a new chat container is detected, it mounts a new observer on it.
 * Only call this function once.
 */
function startSupervisor() {
  setInterval(() => {
    if (!thisExtensionDisabled) {
      if (isMinasonaExtensionEnabled()) {
        console.warn("Disabling community palsona extension because minasona icons were found in the chat!");
        disableThisExtension();
      }
    }
    if (thisExtensionDisabled) {
      disconnectObserver();
      return;
    }
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

function getChannelNameFromTwitch(): string {
  // determine channel name through dom
  const channelInfoElement = document.querySelector<HTMLDivElement>(".channel-info-content");
  const hostingChannelElements = channelInfoElement?.querySelectorAll<HTMLLinkElement>('a[href^="/"]'); // get only internal links starting with "/"

  const channelLinks = Array.from(hostingChannelElements).filter((element) => {
    return element.href.split("/").length === 4; // channel names are in the format "https://twitch.tv/channel" resulting in 4 elements when split
  });

  return channelLinks[0]?.href.split(".tv/")[1];
}

/**
 * Mounts a mutation observer on the given chat container to monitor new chat messages.
 * @param container The chat container element to observe.
 */
function mountObserver(container: HTMLElement) {
  disconnectObserver();
  currentPalsonaList = {};

  currentChatContainer = container;

  let channelName = "";
  // get current channel name from url
  const path = window.location.pathname.toLowerCase();
  const pathItems = path.split("/").filter((seq) => seq.length > 0);
  for (let i = 0; i < pathItems.length; i++) {
    const item = pathItems[i];
    if (item !== "moderator" && item !== "popout") {
      channelName = item;
      break;
    }
  }

  // handle vods
  if (channelName === "videos") {
    channelName = getChannelNameFromTwitch();
  }
  if (channelName === "") return;

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

  // palsona-icon already appended
  if (node.querySelector<HTMLElement>(".palsona-icon")) return;

  // get username
  const usernameElement = getUsernameElement(node);
  if (!usernameElement) return;
  const username = usernameElement.innerText.toLowerCase();
  if (!username) return;

  if (!currentPalsonaList[username]) {
    // calculate palsonas to display for this user based on current channel and settings
    currentPalsonaList[username] = getPalsonaPriorityList(minasonaMap[username] || {}, channelName);
  }

  if (currentPalsonaList[username].length == 0) return;

  // create icon container
  const iconContainer = document.createElement("div");
  iconContainer.classList.add("palsona-icon-container");

  for (const ps of currentPalsonaList[username]) {
    const icon = createPalsonaIcon(ps);
    iconContainer.append(icon);
  }

  displayMinasonaIconContainer(node, iconContainer, usernameElement);
}

/**
 * Determine which palsonas to use for a person watching this channel using the priority list the user set in the settings.
 * The default Minasona is only inserted if the list is empty when its their turn in the priority list.
 *
 * @param userElement The user element from the Minasona storage.
 * @param currentChannelName The currently watched channel name.
 * @returns An array of PalsonaEntrys representing the priority of display.
 */
function getPalsonaPriorityList(userElement: { [communityName: string]: PalsonaEntry }, currentChannelName: string): PalsonaEntry[] {
  // return array to populate
  const palsonaPrioList: PalsonaEntry[] = [];
  // user set prio list without disabled entries
  const cleanedManagerPrioList: managerEntry[] = settingPalsonaManagerList.filter((prio) => prio.enabled);

  // count how many icons we inserted, so we don't go over the limit
  let index = 0;
  const limit = parseInt(settingPalsonaLimit);

  for (const prio of cleanedManagerPrioList) {
    if (index == limit) break;

    const prioString = prio.dataId === "current-channel" ? currentChannelName : prio.dataId;
    if (userElement[prioString]) {
      if (palsonaPrioList.includes(userElement[prioString])) continue;
      palsonaPrioList.push(userElement[prioString]);
      index++;
      continue;
    }
  }
  return palsonaPrioList;
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
  img.classList.add("palsona-icon");
  img.style.height = `${settingIconSize || "32"}px`;

  const icon = document.createElement("picture");
  icon.title = `${getCommunityName(ps.communityName)} (${ps.communityName})`;
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
 * Checks if a 7tv or ffz badge slot can be found and adds the icon container into the badge slot. Otherwise it is prepended to the username.
 * Applies basic spacing to the icon container.
 * @param node The chat message element.
 * @param iconContainer The created icon container containing one or multiple palsona icons.
 * @param usernameElement The extracted username element from the chat message.
 */
function displayMinasonaIconContainer(node: HTMLElement, iconContainer: HTMLDivElement, usernameElement: HTMLElement) {
  // get badge slot to place icon container there if present
  // this is needed to preserve usernames containing color gradients and also the correct display of the pronouns extension
  const sevenTvBadgeSlot = node.querySelector<HTMLElement>(".seventv-chat-user-badge-list");
  if (sevenTvBadgeSlot) {
    // spacing between previous icon and minasona icon
    iconContainer.style.marginLeft = "2px";
    // append to badge slot
    sevenTvBadgeSlot.append(iconContainer);
    return;
  }

  const ffzBadgeSlot = node.querySelector<HTMLElement>(".chat-line__message--badges");
  if (ffzBadgeSlot) {
    // spacing between icon and username needs to be handled by us again
    iconContainer.style.marginRight = "2px";
    // append to badge slot
    ffzBadgeSlot.append(iconContainer);
    return;
  }

  // standard Twitch styling
  if (usernameElement) {
    // spacing between icon and username needs to be handled by us
    iconContainer.style.marginRight = "2px";
    // just prepend iconContainer to name
    usernameElement.prepend(iconContainer);
    return;
  }
}
