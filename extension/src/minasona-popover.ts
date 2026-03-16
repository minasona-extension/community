import browser from "webextension-polyfill";

// the popover showing the minasona image when clicking the icon
let popoverInstance: HTMLElement = null;
let pettingTimeout: NodeJS.Timeout = null;

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
    img.addEventListener("click", () => {
      if (popoverInstance.classList.contains("petting")) return;

      popoverInstance.classList.add("petting");

      pettingTimeout = setTimeout(() => {
        popoverInstance.classList.remove("petting");
      }, 3000);
    });

    const picture = document.createElement("picture");
    picture.appendChild(source);
    picture.appendChild(img);
    popoverInstance.appendChild(picture);

    // add petpet effect
    const petElement = document.createElement("div");
    petElement.classList.add("pet-sprite");
    const petImageUrl = browser.runtime.getURL("assets/petpet-sprite.png");
    petElement.style.backgroundImage = `url(${petImageUrl})`;
    popoverInstance.appendChild(petElement);

    document.body.append(popoverInstance);

    // logic to close popover when clicking outside
    document.addEventListener("click", (e) => {
      if (popoverInstance.classList.contains("active") && !popoverInstance.contains(e.target as HTMLElement)) {
        popoverInstance.classList.remove("active");
        resetPettingEffect(popoverInstance);
      }
    });
  }
  resetPettingEffect(popoverInstance);
  return popoverInstance;
}

function resetPettingEffect(popoverInstance: HTMLElement) {
  popoverInstance.classList.remove("petting");
  clearTimeout(pettingTimeout);
}

/**
 * Shows the minasona popover above to the given icon element.
 * @param minasonaIcon The parent icon element to position the popover above.
 * @param minasonaName The name of the minasona to display.
 * @param imageUrl The image URL of the minasona to display.
 */
export function showMinasonaPopover(minasonaIcon: HTMLElement, imageUrl: string, fallbackImageUrl: string) {
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
