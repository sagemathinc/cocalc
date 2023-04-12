/*
 *  This file is part of CoCalc: Copyright © 2023 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

interface NewsProto {
  id?: string; // assigned by DB, immutable
  channel: Channel; // see CHANNELS_DESCRIPTIONS
  date: number | Date; // number is unix timestamp in seconds
  hide?: boolean; // default false
  tags?: string[]; // list of strings, e.g. ["jupyter", "python"]
  text: string; // Markdown text
  title: string; // title of the news item, should be short
  url?: string; // URL link to an external page (not the news item itself)
}

export interface NewsItem extends NewsProto {
  history?: {
    // key: unix epoch in seconds, when history has been made
    // we don't pick id and hide, because that's not relevant
    [key: number]: Omit<NewsProto, "id" | "hide">;
  };
}

export interface NewTypeWebapp {
  id: string;
  date: Date;
  title: string;
  channel: Channel;
}

export const CHANNELS = [
  "feature",
  "announcement",
  "platform",
  "about",
] as const;

export type Channel = typeof CHANNELS[number];

export const CHANNELS_DESCRIPTIONS: { [name in Channel]: string } = {
  announcement: "Major announcements, important upcoming changes",
  platform:
    "Technical aspects of the service itself, e.g. software environments",
  feature: "New features, changes, and improvements",
  about: "In one's own behalf",
} as const;

// TODO move IconName from @cocalc/frontend/components/icon.tsx out of frontend
export const CHANNELS_ICONS: {
  [key in Channel]: string /* IconName */;
} = {
  feature: "file-alt",
  announcement: "bullhorn",
  platform: "wrench",
  about: "team-outlined",
} as const;
