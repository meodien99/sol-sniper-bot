export type DBCollection = "markets" | "trackList";

export type TrackListItem = Record<string, string>;

export interface IMarketItem {
  marketId: string;
  poolId: string;
  poolOpenTime: number;
  baseMint: string;
}

export interface DBStructures {
  "markets"?: Record<string, IMarketItem>;
  "trackList"?: TrackListItem;
}

export type DBValueSets = {
  "markets": IMarketItem,
  "trackList": TrackListItem
};

export type DBValueSet<K extends keyof DBValueSets = keyof DBValueSets> = {
  [P in K]: DBValueSets[P]
}[K]

export type DBItem<K extends keyof DBStructures = keyof DBStructures> = {
  [P in K]: DBStructures[P]
}[K]

