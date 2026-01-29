import { MAIN_CHANNEL } from "./src/config";
import { MinasonaStorage } from "./src/types";

declare global {
  interface Window {
    browser: any;
  }
}

interface MinawanObject {
  element: HTMLDivElement;
  sprite: HTMLImageElement;
  direction: "left" | "right";
  isPetting: boolean;
}

const pixelsPerSecond = 64;
const minawanWidth = 64;

const credits: string[] = ["hellping219", "hoopykt", "hybert_"];
const minawanObjects: MinawanObject[] = [
  { element: document.getElementById("hellpingwan") as HTMLDivElement, sprite: null, direction: "left", isPetting: false },
  { element: document.getElementById("hoopywan") as HTMLDivElement, sprite: null, direction: "right", isPetting: false },
  { element: document.getElementById("hybertwan") as HTMLDivElement, sprite: null, direction: "right", isPetting: false },
];
minawanObjects.forEach((item) => {
  item.sprite = item.element.childNodes[0] as HTMLImageElement;
});
let minasonaMap: MinasonaStorage = {};
const pettingImage = document.getElementById("petting-effect") as HTMLImageElement;

document.addEventListener("DOMContentLoaded", spawnMinawan);
async function spawnMinawan() {
  // get minasona map
  const result: { minasonaMap?: MinasonaStorage; standardMinasonaUrls?: string[]; pettingUrl?: string } = await window.browser.storage.local.get([
    "minasonaMap",
    "standardMinasonaUrls",
  ]);
  if (!result) return;
  minasonaMap = result.minasonaMap || {};

  minawanObjects.forEach((object, i) => {
    object.sprite.src = minasonaMap[credits[i]][MAIN_CHANNEL].iconUrl;
    object.element.style.bottom = "0px";
    object.element.style.left = `${(i / 3) * window.innerWidth + 32}px`;

    if (i == 2) {
      flipMinawan(object);
      object.element.style.zIndex = "0";
      return;
    }
    startMinawanMovement(object);
  });
}

async function startMinawanMovement(minawanObject: MinawanObject) {
  while (true) {
    await moveMinawan(minawanObject);
  }
}

async function moveMinawan(minawanObject: MinawanObject) {
  if (minawanObject.isPetting) return; // todo pause instead of return

  const targetMoveDuration = Math.random() * 2000 + 1000; // 1-3 seconds
  const waitDuration = Math.random() * 3000 + 2000; // 2-5 seconds

  // idea: we have to split the movement when a minawan hits a wall -> minawan moves towards wall AND minawan moves away from wall in opposite direction
  // check how far we can move in the given time
  // when target is closer than wall -> move to target and end movement loop
  // when the wall is closer than our target -> move to wall (flip) and save already moved time
  // as long as target duration is not reached repeat

  let currentMoveDuration = 0; // keeps track of how long minawan already moved
  while (currentMoveDuration < targetMoveDuration) {
    // the amount of pixels the minawan will travel in the remaining time
    const movePixels = ((targetMoveDuration - currentMoveDuration) / 1000) * pixelsPerSecond;

    if (minawanObject.direction === "right") {
      let targetX = window.innerWidth - minawanWidth; // set target to right wall
      const targetPixelDiff = targetX - minawanObject.element.offsetLeft; // difference of pixels from minawan to target (wall)
      if (targetPixelDiff > movePixels) {
        // wall is too far away to reach in time
        targetX = minawanObject.element.offsetLeft + movePixels; // our target is the move pixels amount
        currentMoveDuration = targetMoveDuration; // set current move duration to target because movement is done
        await moveToPixel(minawanObject, targetX);
      } else {
        // wall is in reach
        currentMoveDuration += (targetPixelDiff / pixelsPerSecond) * 1000; // add movement time to wall to current move duration
        await moveToWall(minawanObject);
      }
    } else {
      let targetX = 0; // set target to left wall
      const targetPixelDiff = minawanObject.element.offsetLeft - targetX; // difference of pixels from minawan to target (wall)
      if (targetPixelDiff > movePixels) {
        // wall is too far away to reach in time
        targetX = minawanObject.element.offsetLeft - movePixels; // our target is the move pixels amount
        currentMoveDuration = targetMoveDuration; // set current move duration to target because movement is done
        await moveToPixel(minawanObject, targetX);
      } else {
        // wall is in reach
        currentMoveDuration += (targetPixelDiff / pixelsPerSecond) * 1000; // add movement time to wall to current move duration
        await moveToWall(minawanObject);
      }
    }
  }
  await new Promise((res) => setTimeout(res, waitDuration));
  // flip movement with 25% chance
  const randomMove = Math.floor(Math.random() * 4);
  if (randomMove === 0) {
    flipMinawan(minawanObject);
  }
}

async function moveToPixel(minawanObject: MinawanObject, targetX: number): Promise<void> {
  // calc time needed to move there
  const distance = Math.abs(targetX - minawanObject.element.offsetLeft);
  const moveTime = (distance / pixelsPerSecond) * 1000;

  await applyMovement(minawanObject, targetX, moveTime);
}

async function moveToWall(minawanObject: MinawanObject): Promise<void> {
  const targetX = minawanObject.direction === "left" ? 0 : window.innerWidth - minawanWidth;
  const distance = Math.abs(targetX - minawanObject.element.offsetLeft);
  const moveTime = (distance / pixelsPerSecond) * 1000;

  await applyMovement(minawanObject, targetX, moveTime);
  flipMinawan(minawanObject);
}

function flipMinawan(minawanObject: MinawanObject) {
  minawanObject.direction = minawanObject.direction === "left" ? "right" : "left";
  if (minawanObject.element.classList.contains("flipped")) {
    minawanObject.element.classList.remove("flipped");
  } else {
    minawanObject.element.classList.add("flipped");
  }
}

async function applyMovement(minawanObject: MinawanObject, targetX: number, moveDuration: number): Promise<void> {
  minawanObject.element.style.transition = `left ${moveDuration}ms linear`;
  minawanObject.element.style.left = `${targetX}px`;

  await new Promise((res) => setTimeout(res, moveDuration));
}
