export interface Message {
  to: string;
  from?: string;
  subject: string;
  text: string;
  html: string;
}
