import browser from "webextension-polyfill";

let nativeUsercardObserver: MutationObserver | null = null;
let sevenTvUsercardObserver: MutationObserver | null = null;
let newSevenTvUsercardObserver: MutationObserver | null = null;

//todo initialize extension settings if you have any

// We need to make sure our observers attach AFTER 7tv loads their stuff. This is why an the DOMContentLoaded event is not working here...
// maybe you can come up with a better way.. :) idk
setTimeout(main, 5000);

function main() {
  startNativeUsercardObserver();
  startSevenTvUsercardObserver();
  startNewSevenTvUsercardObserver();

  // if url contains "viewercard" -> we know its a single page usercard
  // this makes getting the username easier since its in the url hehe
  const path = window.location.pathname.toLowerCase();
  const pathItems = path.split("/").filter((seq) => seq.length > 0);
  if (!pathItems.includes("viewercard")) return;

  handlePopoutUsercard(pathItems[3]);
}

/**
 * Statically checks if a usercard is on the page and adds Palsonas to it.
 * @param username Username of the user.
 */
function handlePopoutUsercard(username: string) {
  const viewerCard = document.querySelector<HTMLElement>("#VIEWER_CARD_ID");
  if (!viewerCard) return;

  //todo check if your content was already added

  //todo create usercard content for:
  console.log(username);
}

/**
 * Starts the observer that observes the native popup layer and adds Palsonas to usercards when detected.
 */
function startNativeUsercardObserver() {
  const popupLayer = document.querySelector<HTMLElement>(".viewer-card-layer");
  if (!popupLayer) return;

  nativeUsercardObserver = new MutationObserver(() => {
    // check if popup layer contains elements
    if (popupLayer.childElementCount == 0) return;
    //todo check if your content already added

    const nameTag = popupLayer.querySelector<HTMLLinkElement>("a");
    if (!nameTag || nameTag.innerText.length == 0) return;

    //todo create usercard content for
    console.log(nameTag.innerText);
    // remember to handle localized usernames!
  });
  nativeUsercardObserver.observe(popupLayer, { childList: true, subtree: true });
}

/**
 * Starts the observer that observes the 7tv popup layer and adds Palsonas to usercards when detected.
 */
function startSevenTvUsercardObserver() {
  const popupLayer = document.querySelector<HTMLElement>("#seventv-float-context");
  if (!popupLayer) return;

  sevenTvUsercardObserver = new MutationObserver(() => {
    // check if popup layer contains elements
    if (popupLayer.childElementCount == 0) return;
    // for each card
    for (const usercard of Array.from(popupLayer.children)) {
      //todo check if your content was already added

      const nameTag = usercard.querySelector<HTMLElement>(".seventv-chat-user-username");
      if (!nameTag) continue;

      //todo create usercard content for
      console.log(nameTag.innerText);
    }
  });
  sevenTvUsercardObserver.observe(popupLayer, { childList: true, subtree: false });
}

function startNewSevenTvUsercardObserver() {
  const popupLayer = document.querySelector<HTMLElement>("#seventv-root");
  if (!popupLayer) return;

  newSevenTvUsercardObserver = new MutationObserver(async () => {
    await new Promise((res) => setTimeout(res, 100));
    if (popupLayer.childElementCount == 0) return;

    //todo check if your content was already added

    const usercard = popupLayer.querySelector<HTMLElement>(".seventv-usercard");
    if (!usercard) return;
    const nameTag = usercard.querySelector<HTMLElement>(".seventv-usercard-display-name");
    if (!nameTag) return;

    //todo create usercard content for
    console.log(nameTag.innerText);
    //CAUTION this is always the displayname I think, NOT the username
  });
  newSevenTvUsercardObserver.observe(popupLayer, { childList: true, subtree: false });
}

/**
 * Disconnects the current observers from the dom.
 */
function disconnectObservers() {
  if (nativeUsercardObserver) {
    nativeUsercardObserver.disconnect();
    nativeUsercardObserver = null;
  }
  if (sevenTvUsercardObserver) {
    sevenTvUsercardObserver.disconnect();
    sevenTvUsercardObserver = null;
  }
  if (newSevenTvUsercardObserver) {
    newSevenTvUsercardObserver.disconnect();
    newSevenTvUsercardObserver = null;
  }
}

/**
 * Hoopys API returns only user/account names, NOT display names!
 * If chat name contains a bracket it must be in the format `displayname (username)`.
 * @param chatName The full name displayed in chat.
 * @returns The user-/accountname of a user.
 */
function handleUsernameLocalization(chatName: string): string {
  if (chatName.includes("(")) return chatName.split("(")[1].slice(0, -1);
  return chatName;
}
