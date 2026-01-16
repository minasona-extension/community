export interface MinasonaStorage {
  [username: string]: { [communityName: string]: { iconUrl: string; fallbackIconUrl: string; imageUrl: string; fallbackImageUrl: string } };
}
