// the main channel this extension belongs to
// this community always has priority when displaying the icons in chat
export const MAIN_CHANNEL = "cerbervt";

// interval in minutes to fetch from the API
export const UPDATE_INTERVAL = 15;

export enum prioChannel {
  MAIN_CHANNEL,
  CURRENT_CHANNEL,
  OTHER_CHANNELS,
}
