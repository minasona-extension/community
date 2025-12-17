export interface MinasonaStorage {
  [username: string]: string;
}

export interface MinasonaMap {
  [username: string]: { minasonaName: string; iconUrl: string; imageUrl: string };
}
