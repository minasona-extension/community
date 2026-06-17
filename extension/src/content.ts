import { showMinasonaPopover } from "./minasona-popover";
import { communityData, managerEntry, MinasonaStorage, PalsonaEntry } from "./types";
import browser from "webextension-polyfill";

let thisExtensionDisabled = false;
handleMinasonaExtension();

// the mapping of twitch usernames to minasona names and image urls
let minasonaMap: MinasonaStorage = {};
let communityMap: Record<string, communityData> = {};

// the currently observed chat container and its observer
let currentChatContainer: HTMLElement | null = null;
let chatContainerScroller: HTMLElement | null = null;
let currentObserver: MutationObserver | null = null;
let currentNativeUsercardObserver: MutationObserver | null = null;
let currentSevenTvUsercardObserver: MutationObserver | null = null;
let currentNewSevenTvUsercardObserver: MutationObserver | null = null;
//let currentHoverHandler: ((e: MouseEvent) => void) | null = null;
let currentChannelName: string = "";
// the user list for the current chat with the current settings
// this list is used, so we don't have to recalculate which palsona to use each time a user chats
const currentPalsonaList = new Map<string, PalsonaEntry[]>();
const MAX_CACHE_SIZE = 4000;

// settings - initialize with defaults
let settingPalsonaManagerList: managerEntry[] = [{ dataId: "current-channel", enabled: true }];
let settingPalsonaLimit = "3";
let settingIconSize = "32";
let settingPalsonasInUserCards = true;

applySettings();
fetchMinasonaMap();
startSupervisor();

/**
 * Fetches settings from the browsers storage and applies them to the local variables.
 */
async function applySettings() {
  const result: { palsonaManagerList?: managerEntry[]; palsonaLimit?: string; iconSize?: string; palsonasInUserCards?: boolean } =
    await browser.storage.sync.get(["palsonaManagerList", "palsonaLimit", "iconSize", "palsonasInUserCards"]);
  const communityResponse: { communities?: Record<string, communityData> } = await browser.storage.local.get(["communities"]);
  communityMap = communityResponse.communities || {};

  if (settingPalsonaManagerList != result.palsonaManagerList) {
    settingPalsonaManagerList = result.palsonaManagerList ?? [
      { dataId: "current-channel", enabled: true },
      ...Object.keys(communityMap).map((community) => {
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

  if (settingPalsonasInUserCards != result.palsonasInUserCards) {
    settingPalsonasInUserCards = result.palsonasInUserCards ?? true;
    // reload observers
    if (currentChatContainer) {
      mountObserver(currentChatContainer);
    }
  }

  // reset current lookup list because settings changed and it needs to be regenerated
  currentPalsonaList.clear();
}
// listen for settings changes
browser.storage.onChanged.addListener((changes, namespace) => {
  if (namespace === "sync") {
    applySettings();
  } else if (namespace === "local" && changes.minasonaMap) {
    fetchMinasonaMap();
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
  currentPalsonaList.clear();
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
    // if current container unchanged, skip
    if (currentChatContainer && document.body.contains(currentChatContainer)) return;
    // get native, 7tv and VOD chat containers

    // seven tv has priority
    const sevenTvChatContainer = document.querySelector<HTMLElement>(".seventv-chat-list main");
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
        chatContainerScroller = nativeChatContainer.parentElement;
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

    // handle popout viewercards
    // if settingUsercards && url contains "viewercard" -> detect elements in DOM but no observer needed since page is pretty much static
    // viewercard url structure: https://www.twitch.tv/popout/CHANNEL/viewercard/USER?popout=
    if (!settingPalsonasInUserCards) return;

    const path = window.location.pathname.toLowerCase();
    const pathItems = path.split("/").filter((seq) => seq.length > 0);
    if (!pathItems.includes("viewercard")) return;

    currentChannelName = pathItems[1];
    handlePopoutUsercard(pathItems[3]);
  }, 5000);
}

function getChannelNameFromTwitch(): string | undefined {
  // determine channel name through dom
  const channelInfoElement = document.querySelector<HTMLDivElement>(".channel-info-content");
  const hostingChannelElements = channelInfoElement?.querySelectorAll<HTMLLinkElement>('a[href^="/"]'); // get only internal links starting with "/"
  if (!hostingChannelElements) return;

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
  currentPalsonaList.clear();

  currentChatContainer = container;

  // get current channel name from url
  const path = window.location.pathname.toLowerCase();
  const pathItems = path.split("/").filter((seq) => seq.length > 0);
  for (let i = 0; i < pathItems.length; i++) {
    const item = pathItems[i];
    if (item !== "moderator" && item !== "popout") {
      currentChannelName = item;
      break;
    }
  }

  // handle vods
  if (currentChannelName === "videos") {
    currentChannelName = getChannelNameFromTwitch() || "";
  }
  if (currentChannelName === "") return;

  addPopoverListener();

  // create and start observer
  currentObserver = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      mutation.addedNodes.forEach((node) => {
        processNode(node);
      });
    });
  });
  currentObserver.observe(container, { childList: true, subtree: false });

  /*
  // Re-inject icons after 7TV shared-chat hover rewrites the DOM.
  // A single delegated mouseover listener is more performant than subtree:true
  // observers or per-element observers — zero overhead when not hovering.
  currentHoverHandler = async (e: MouseEvent) => {
    const target = e.target as HTMLElement;
    const messageNode = target.closest<HTMLElement>(".seventv-chat-message, .chat-line__message");
    if (!messageNode) return;
    console.log("got message node");

    // Let 7TV finish its DOM rewrite before checking
    // works most of the time but not when moving the mouse fast over 7tvs popover, then icon disappears but function is called regardless.
    // I think this function runs first, detects the container is still there and then 7tv removes it. Maybe add a small delay (10ms)
    await new Promise((res) => setTimeout(res, 20));
    if (messageNode.querySelector(".minasona-icon-container")) return;
    processNode(messageNode);
  };
  container.addEventListener("mouseover", currentHoverHandler);
  container.addEventListener("mouseleave", currentHoverHandler);
  */

  if (settingPalsonasInUserCards) {
    startNativeUsercardObserver();
    startSevenTvUsercardObserver();
    startNewSevenTvUsercardObserver();
  }
}

function addPopoverListener() {
  document.addEventListener(
    "click",
    (e) => {
      const icon = (e.target as HTMLElement).closest<HTMLElement>(".palsona-icon");
      if (!icon || !icon.parentElement) return;
      e.preventDefault();
      e.stopPropagation();
      // use parent element since onclick is always <img /> and not created <picture><source /><img /></picture> with data fields
      const imageUrl = icon.parentElement.dataset.imageUrl;
      const fallbackUrl = icon.parentElement.dataset.fallbackUrl;
      if (imageUrl && fallbackUrl) showMinasonaPopover(icon.parentElement, imageUrl, fallbackUrl);
    },
    { capture: true },
  );
}

/**
 * Statically checks if a usercard is on the page and adds Palsonas to it.
 * @param username Username of the user.
 */
function handlePopoutUsercard(username: string) {
  const viewerCard = document.querySelector<HTMLElement>("#VIEWER_CARD_ID");
  if (!viewerCard) return;

  if (viewerCard.querySelector<HTMLElement>(".viewer-card-palsona")) return;

  const palsonaBanner = createPalsonaBanner(username);
  if (!palsonaBanner) return;
  addPalsonaSectionToViewerCard(viewerCard, palsonaBanner);
  addPopoverListener();
}

/**
 * Starts the observer that observes the native popup layer and adds Palsonas to usercards when detected.
 */
function startNativeUsercardObserver() {
  const popupLayer = document.querySelector<HTMLElement>(".viewer-card-layer");
  if (!popupLayer) return;

  currentNativeUsercardObserver = new MutationObserver(() => {
    // check if popup layer contains elements
    if (popupLayer.childElementCount == 0) return;
    // check if banner already added
    if (popupLayer.querySelector<HTMLElement>(".viewer-card-palsona")) return;

    const nameTag = popupLayer.querySelector<HTMLLinkElement>("a");
    if (!nameTag || nameTag.innerText.length == 0) return;
    const viewerCard = popupLayer.querySelector<HTMLElement>("#VIEWER_CARD_ID");
    if (!viewerCard) return;
    const palsonaBanner = createPalsonaBanner(handleUsernameLocalization(nameTag.innerText).toLowerCase());
    if (!palsonaBanner) return;
    addPalsonaSectionToViewerCard(viewerCard, palsonaBanner);
  });
  currentNativeUsercardObserver.observe(popupLayer, { childList: true, subtree: true });
}

/**
 * Starts the observer that observes the 7tv popup layer and adds Palsonas to usercards when detected.
 */
function startSevenTvUsercardObserver() {
  const popupLayer = document.querySelector<HTMLElement>("#seventv-float-context");
  if (!popupLayer) return;

  currentSevenTvUsercardObserver = new MutationObserver(() => {
    // check if popup layer contains elements
    if (popupLayer.childElementCount == 0) return;
    // for each card
    for (const usercard of Array.from(popupLayer.children)) {
      // check if banner already added
      if (usercard.querySelector<HTMLElement>(".viewer-card-palsona")) continue;

      const nameTag = usercard.querySelector<HTMLElement>(".seventv-chat-user-username");
      if (!nameTag) continue;
      const seventvViewerCard = usercard.querySelector<HTMLElement>(".seventv-user-card");
      if (!seventvViewerCard) continue;
      const palsonaBanner = createPalsonaBanner(handleUsernameLocalization(nameTag.innerText).toLowerCase());
      if (!palsonaBanner) continue;
      addPalsonaSectionToViewerCard(seventvViewerCard, palsonaBanner);
      seventvViewerCard.classList.add("ps-container");
    }
  });
  currentSevenTvUsercardObserver.observe(popupLayer, { childList: true, subtree: false });
}

function startNewSevenTvUsercardObserver() {
  const popupLayer = document.querySelector<HTMLElement>("#seventv-root");
  if (!popupLayer) return;

  currentNewSevenTvUsercardObserver = new MutationObserver(async () => {
    await new Promise((res) => setTimeout(res, 100));
    if (popupLayer.childElementCount == 0) return;
    if (popupLayer.querySelector<HTMLElement>(".viewer-card-palsona")) return;
    const usercard = popupLayer.querySelector<HTMLElement>(".seventv-usercard");
    if (!usercard) return;
    const nameTag = usercard.querySelector<HTMLElement>(".seventv-usercard-display-name");
    if (!nameTag) return;
    const palsonaBanner = createPalsonaBanner(handleUsernameLocalization(nameTag.innerText).toLowerCase());
    if (!palsonaBanner) return;
    addPalsonaSectionToViewerCard(usercard, palsonaBanner, "append");
    usercard.classList.add("ps-container");
  });
  currentNewSevenTvUsercardObserver.observe(popupLayer, { childList: true, subtree: false });
}

/**
 * Disconnects the current observer from the chat container, if any.
 */
function disconnectObserver() {
  if (currentObserver) {
    currentObserver.disconnect();
    currentObserver = null;
  }
  /*if (currentHoverHandler && currentChatContainer) {
    currentChatContainer.removeEventListener("mouseover", currentHoverHandler);
    currentHoverHandler = null;
  }*/
  currentChatContainer = null;
  chatContainerScroller = null;

  if (currentNativeUsercardObserver) {
    currentNativeUsercardObserver.disconnect();
    currentNativeUsercardObserver = null;
  }
  if (currentSevenTvUsercardObserver) {
    currentSevenTvUsercardObserver.disconnect();
    currentSevenTvUsercardObserver = null;
  }
  if (currentNewSevenTvUsercardObserver) {
    currentNewSevenTvUsercardObserver.disconnect();
    currentNewSevenTvUsercardObserver = null;
  }
}

/**
 * Extracts the username element from a chat message element.
 * @param node The chat message element.
 * @returns The username element.
 */
function getUsernameElement(node: HTMLElement): HTMLElement | null {
  const usernameElement = node.querySelector<HTMLElement>(".seventv-chat-user-username, .chat-line__username, .video-chat__message-author");
  return usernameElement;
}

/**
 * API returns only user/account names, NOT display names!
 * If username contains a bracket it must be in the format `displayname (username)`.
 * @param username The full name displayed in chat.
 * @returns The displayname or the full name if no brackets detected.
 */
function handleUsernameLocalization(username: string): string {
  if (username.includes("(")) return username.split("(")[1].slice(0, -1);
  return username;
}

/**
 * Processes a node in the chat container.
 * This function checks the username of the author and adds the icon(s) if criteria are met.
 * @param node The added node to process.
 */
function processNode(node: Node) {
  if (!(node instanceof HTMLElement)) return;

  // get username
  const usernameElement = getUsernameElement(node);
  if (!usernameElement) return;
  const username = handleUsernameLocalization(usernameElement.innerText).toLowerCase();
  if (!username) return;

  // handle currentPalsonaList map size to prevent memory issues
  if (currentPalsonaList.size > MAX_CACHE_SIZE) {
    // delete the oldest quarter of the cache
    const keysToDelete = [...currentPalsonaList.keys()].slice(0, MAX_CACHE_SIZE / 4);
    keysToDelete.forEach((k) => currentPalsonaList.delete(k));
  }

  if (!currentPalsonaList.has(username)) {
    // calculate palsonas to display for this user based on current channel and settings
    currentPalsonaList.set(username, getPalsonaPriorityList(minasonaMap[username] || {}));
  }

  const psEntry = currentPalsonaList.get(username);
  if (!psEntry || psEntry.length == 0) return;

  // create icon container
  const iconContainer = document.createElement("div");
  iconContainer.classList.add("palsona-icon-container");

  for (const ps of psEntry) {
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
 * @param applyLimit Whether to use the user specified limit or display all palsonas.
 * @returns An array of PalsonaEntrys representing the priority of display.
 */
function getPalsonaPriorityList(userElement: { [communityName: string]: PalsonaEntry }, applyLimit: boolean = true): PalsonaEntry[] {
  // return array to populate
  const palsonaPrioList: PalsonaEntry[] = [];
  // user set prio list without disabled entries
  const cleanedManagerPrioList: managerEntry[] = applyLimit ? settingPalsonaManagerList.filter((prio) => prio.enabled) : settingPalsonaManagerList;

  // count how many icons we inserted, so we don't go over the limit
  let index = 0;
  const limit = parseInt(settingPalsonaLimit);

  for (const prio of cleanedManagerPrioList) {
    if (applyLimit && index == limit) break;

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
 * @param manualHeight Whether to use the user specified height or a manual set height.
 * @returns The icon element.
 */
function createPalsonaIcon(ps: PalsonaEntry, manualHeight?: string): HTMLPictureElement {
  const source = document.createElement("source");
  source.srcset = ps.iconUrl;
  source.type = "image/avif";

  const img = document.createElement("img");
  img.src = ps.fallbackIconUrl;
  img.draggable = false;
  img.loading = "lazy";
  img.classList.add("palsona-icon");
  img.style.height = `${manualHeight ? manualHeight : settingIconSize || "32"}px`;

  const icon = document.createElement("picture");
  icon.title = `${communityMap[ps.communityName]?.nameSingular || "Palsona"} (${ps.communityName.charAt(0).toUpperCase()}${ps.communityName.slice(1)})`;
  icon.appendChild(source);
  icon.appendChild(img);
  // add popover on click if its not a default minasona
  if (ps.imageUrl) {
    icon.dataset.imageUrl = ps.imageUrl;
    icon.dataset.fallbackUrl = ps.fallbackImageUrl;
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
    fixLinebreak(usernameElement, true);
    return;
  }

  const ffzBadgeSlot = node.querySelector<HTMLElement>(".chat-line__message--badges");
  if (ffzBadgeSlot) {
    // spacing between icon and username needs to be handled by us again
    iconContainer.style.marginRight = "2px";
    // append to badge slot
    ffzBadgeSlot.append(iconContainer);
    fixLinebreak(usernameElement, false);
    return;
  }

  // standard Twitch styling
  if (usernameElement) {
    // spacing between icon and username needs to be handled by us
    iconContainer.style.marginRight = "2px";
    // just prepend iconContainer to name
    usernameElement.prepend(iconContainer);
    fixLinebreak(usernameElement, true);
    // manually scroll the chat to the bottom so the last message is not cut off if the user chose large icons
    smartScrollNativeChat();
    return;
  }
}

let scrollRafId: number | null = null;
/**
 * Scrolls the native Twitch chat window to the bottom if below a threshold.
 */
function smartScrollNativeChat() {
  if (scrollRafId) return;
  scrollRafId = requestAnimationFrame(() => {
    scrollRafId = null;

    if (!chatContainerScroller) return;
    const threshold = 150; // pixels from bottom
    const isAtBottom = chatContainerScroller.scrollHeight - chatContainerScroller.scrollTop - chatContainerScroller.clientHeight < threshold;

    if (!isAtBottom) return;
    chatContainerScroller.scrollTop = chatContainerScroller.scrollHeight;
  });
}

/**
 * Makes sure the username stays in one piece when it becomes longer than one line.
 * Also makes sure the chat message starts right behind the name even in case of a line break.
 * @param usernameElement The username element of the chat message.
 * @param fixInline Whether to fix the inline blocks in the chat message DOM.
 */
function fixLinebreak(usernameElement: HTMLElement, fixInline: boolean) {
  if (fixInline) {
    // username is always a div but text is always a span ... - not needed on FFZ!
    usernameElement.parentElement?.parentElement?.childNodes.forEach((child) => {
      if (!(child instanceof HTMLElement)) return;
      child.style.setProperty("display", "inline", "important");
    });
  }
  // add line breaking to username element
  usernameElement.style.wordBreak = "keep-all";
}

function addPalsonaSectionToViewerCard(viewerCard: HTMLElement, bannerElement: HTMLElement, position: "default" | "append" = "default") {
  if (position === "default") {
    const viewerCardHeader = viewerCard.childNodes[0] as HTMLElement;
    viewerCardHeader.insertBefore(bannerElement, viewerCardHeader.childNodes[1]);
  } else {
    viewerCard.insertBefore(bannerElement, viewerCard.childNodes[1]);
  }
}

function createPalsonaBanner(username: string): HTMLElement | undefined {
  if (!minasonaMap[username]) return;
  const container = document.createElement("div");
  container.classList.add("viewer-card-palsona");

  const title = document.createElement("div");
  title.classList.add("viewer-card-palsona-title");
  title.innerText = "Palsonas";
  container.appendChild(title);

  const palsonaContainer = document.createElement("div");
  palsonaContainer.classList.add("viewer-card-palsona-container");
  for (const ps of getPalsonaPriorityList(minasonaMap[username] || {}, false)) {
    const icon = createPalsonaIcon(ps, "64");
    icon.style.marginLeft = "2px";
    icon.style.marginRight = "2px";
    palsonaContainer.append(icon);
  }
  container.appendChild(palsonaContainer);
  return container;
}
