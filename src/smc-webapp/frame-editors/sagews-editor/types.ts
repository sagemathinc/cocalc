export interface OutputMessage {}

export interface OutputMessages {
  [key: string]: OutputMessage;
}

export interface CellObject {
  id: string;
  pos?: number;
  flags?: string;
  input?: string;
  output?: OutputMessages;
}
