/*
 *  This file is part of CoCalc: Copyright © 2023 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
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
  until?: number | Date; // optional expiration date - news item will not be shown after this date
}

export interface NewsItem extends NewsProto {
  history?: {
    // key: unix epoch in seconds, when history has been made
    // we don't pick id and hide, because that's not relevant
    [key: number]: Omit<NewsProto, "id" | "hide">;
  };
}

// NewsProto but without hide, text, and url
export type RecentHeadline = Omit<NewsProto, "hide" | "text" | "url">;

// This is what the frontend gets from the backend
export interface NewsItemWebapp {
  id: string;
  date: Date;
  title: string;
  channel: Channel;
  tags?: string[];
}

export const EVENT_CHANNEL = "event";

export const CHANNELS = [
  "feature",
  "announcement",
  "platform",
  "about",
  EVENT_CHANNEL,
] as const;

export type Channel = (typeof CHANNELS)[number];

export const CHANNELS_DESCRIPTIONS: { [name in Channel]: string } = {
  announcement: "Major announcements, important upcoming changes",
  event: "Conferences and other events",
  feature: "New features, changes, and improvements",
  about: "In one's own behalf",
  platform:
    "Technical aspects of the service itself, e.g. software environments",
} as const;

// TODO move IconName from @cocalc/frontend/components/icon.tsx out of frontend
export const CHANNELS_ICONS: {
  [key in Channel]: string /* IconName */;
} = {
  announcement: "bullhorn",
  event: "calendar",
  feature: "file-alt",
  about: "team-outlined",
  platform: "wrench",
} as const;

export function isNewsChannel(channel: string): channel is Channel {
  return typeof channel === "string" && CHANNELS.includes(channel as Channel);
}

export type NewsPrevNext = Pick<NewsItem, "id" | "title">;
