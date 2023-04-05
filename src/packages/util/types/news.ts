export interface NewsType {
  id?: string;
  date: Date;
  title: string;
  channel: Channel;
  text: string;
  url: string;
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
