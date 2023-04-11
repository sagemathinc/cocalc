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

// TODO extract IconName from @cocalc/frontend/components/icon.tsx
export const CHANNELS_ICONS: {
  [key in Channel]: string /* IconName */;
} = {
  feature: "file-alt",
  announcement: "bullhorn",
  platform: "wrench",
  about: "user",
} as const;
