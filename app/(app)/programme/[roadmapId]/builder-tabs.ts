/** A plain module, because the server page reads this and a client file's exports are opaque to it. */
export const BUILDER_TABS = [
  "items",
  "circles",
  "rewards",
  "settings",
] as const;
export type BuilderTab = (typeof BUILDER_TABS)[number];
