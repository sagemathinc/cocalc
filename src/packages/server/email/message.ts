import { EmailTemplateName } from "./types";

export interface Message {
  to: string;
  from?: string;
  subject: string;
  text: string;
  html: string;
  channel: EmailTemplateName;
}
