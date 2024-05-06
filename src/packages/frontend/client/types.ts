export interface Message {
  role: "assistant" | "user" | "system";
  content: string;
  date?: Date; // remove the date when sending to the server
}

export type History = Message[];
