/** A plain module, because the server page reads this and a client file's exports are opaque to it. */
export const MANAGE_TABS = ["members", "tasks", "settings"] as const;
export type ManageTab = (typeof MANAGE_TABS)[number];
