// interval in minutes to fetch from the API
export const UPDATE_INTERVAL = 15;

export function getIconSrc(dataId: string): string {
  switch (dataId) {
    case "cerbervt":
      return "assets/Minawan_Purple_64x64.png";
    case "chrchie":
      return "assets/wormpal.png";
    case "minikomew":
      return "assets/minyan_cropped.png";
    case "shoomimi":
      return "assets/shoominyan_64x64.png";
    default:
      return "assets/Ditto.png";
  }
}

export function getCommunityName(dataId: string): string {
  switch (dataId) {
    case "cerbervt":
      return "Minawan";
    case "chrchie":
      return "Wormpal";
    case "minikomew":
      return "Minyan";
    case "shoomimi":
      return "Shoominion";
    case "current-channel":
      return "Current Channel Palsona";
    default:
      return `${dataId.charAt(0).toUpperCase()}${dataId.slice(1)}'s Channel Palsona`;
  }
}
