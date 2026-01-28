export interface PalsonaEntry {
  iconUrl: string;
  fallbackIconUrl: string;
  imageUrl: string;
  fallbackImageUrl: string;
}

/**
 * This is the data format the users are stored in the extension storage.
 * Each user has multiple palsona entries. Identified by community name.
 */
export interface MinasonaStorage {
  [username: string]: { [communityName: string]: PalsonaEntry };
}

export interface managerEntry {
  dataId: string;
  enabled: boolean;
}
