export interface NewsType {
  id: string;
  date: Date;
  title: string;
  channel: Channel;
  text: string;
  url: string;
}

export const CHANNELS = ["announcement", "software", "platform"] as const;
export type Channel = typeof CHANNELS[number];

