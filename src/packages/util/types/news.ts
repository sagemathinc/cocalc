/*
 *  This file is part of CoCalc: Copyright © 2023 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

export interface NewsType {
  id?: string;
  date: number | Date; // number is unix timestamp in seconds
  title: string;
  channel: Channel;
  text: string;
  url: string;
  hide?: boolean; // default false
  history?: {
    // unix epoch in seconds, when history has been made
    [key: number]: {
      title: string;
      text: string;
      url: string;
      channel: Channel;
    };
  };
}

export const CHANNELS = [
  "news",
  "announcement",
  "feature",
  "platform",
] as const;

export type Channel = typeof CHANNELS[number];

export const CHANNELS_DESCRIPTIONS = {
  news: "General day-to-day news",
  announcement: "Major announcements, important upcoming changes",
  platform: "More on the technical side, like software environments",
  feature: "New features, updates, and improvements",
} as const;

// TODO extract IconName from @cocalc/frontend/components/icon.tsx
export const CHANNELS_ICONS /*: {[key in Channel]: IconName}*/ = {
  news: "file-alt",
  announcement: "bullhorn",
  platform: "wrench",
  feature: "atom",
} as const;
