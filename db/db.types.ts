export type DBCollection = "markets" | "track";

export type TrackObject = Record<string, string>;

export interface IMarketItem {
  marketId: string;
  poolId: string;
  poolOpenTime: number;
  baseMint: string;
}

export interface DBStructures {
  "markets"?: Record<string, IMarketItem>;
  "track"?: TrackObject;
}

export type DBStructure<K extends keyof DBStructures = keyof DBStructures> = {
  [P in K]: DBStructures[P]
}[K]

export type DBValueSets = {
  "markets": IMarketItem,
  "track": string
};

export type DBValueSet<K extends keyof DBValueSets = keyof DBValueSets> = {
  [P in K]: DBValueSets[P]
}[K]

