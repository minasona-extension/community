import { UPDATE_INTERVAL } from "./config";
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
let currentChannelName: string = "";
// the user list for the current chat with the current settings
// this list is used, so we don't have to recalculate which palsona to use each time a user chats
let currentPalsonaList: { [username: string]: PalsonaEntry[] } = {};

// settings - initialize with defaults
let settingPalsonaManagerList: managerEntry[] = [{ dataId: "current-channel", enabled: true }];
let settingPalsonaLimit = "3";
let settingIconSize = "32";
let settingPalsonasInUserCards = true;

applySettings();
fetchMinasonaMap();
startSupervisor();

setInterval(fetchMinasonaMap, UPDATE_INTERVAL * 60 * 1000);

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
    currentChannelName = getChannelNameFromTwitch();
  }
  if (currentChannelName === "") return;

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

  if (settingPalsonasInUserCards) {
    startNativeUsercardObserver();
    startSevenTvUsercardObserver();
  }
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
    const palsonaBanner = createPalsonaBanner(nameTag.innerText.toLowerCase());
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
      const palsonaBanner = createPalsonaBanner(nameTag.innerText.toLowerCase());
      if (!palsonaBanner) continue;
      addPalsonaSectionToViewerCard(seventvViewerCard, palsonaBanner);
    }
  });
  currentSevenTvUsercardObserver.observe(popupLayer, { childList: true, subtree: false });
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
  chatContainerScroller = null;

  if (currentNativeUsercardObserver) {
    currentNativeUsercardObserver.disconnect();
    currentNativeUsercardObserver = null;
  }
  if (currentSevenTvUsercardObserver) {
    currentSevenTvUsercardObserver.disconnect();
    currentSevenTvUsercardObserver = null;
  }
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
function processNode(node: Node) {
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
    currentPalsonaList[username] = getPalsonaPriorityList(minasonaMap[username] || {});
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

/**
 * Scrolls the native Twitch chat window to the bottom if below a threshold.
 */
function smartScrollNativeChat() {
  if (!chatContainerScroller) return;

  const threshold = 150; // pixels from bottom
  const isAtBottom = chatContainerScroller.scrollHeight - chatContainerScroller.scrollTop - chatContainerScroller.clientHeight < threshold;

  if (!isAtBottom) return;
  chatContainerScroller.scrollTop = chatContainerScroller.scrollHeight;
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
    usernameElement.parentElement.parentElement.childNodes.forEach((child) => {
      if (!(child instanceof HTMLElement)) return;
      child.style.setProperty("display", "inline", "important");
    });
  }
  // add line breaking to username element
  usernameElement.style.wordBreak = "normal";
}

function addPalsonaSectionToViewerCard(viewerCard: HTMLElement, bannerElement: HTMLElement) {
  const viewerCardElement = viewerCard.childNodes[0] as HTMLElement;
  viewerCardElement.insertBefore(bannerElement, viewerCardElement.childNodes[1]);
}

function createPalsonaBanner(username: string): HTMLElement {
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
