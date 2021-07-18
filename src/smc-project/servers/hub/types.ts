export interface Message {
  event: string;
  id?: string;
  pid?: number;
  signal?: string | number;
  error?: string;
}
