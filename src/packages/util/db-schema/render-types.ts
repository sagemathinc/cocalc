interface AccountAvatar {
  type: "account_avatar";
  account_id: string; // column with account_id
}

interface Array {
  type: "array";
  ofType: "text" | "json";
}

interface Blob {
  type: "blob";
}

interface Boolean {
  type: "boolean";
  editable?: boolean;
}

interface Copyable {
  type: "copyable";
}

interface EmailAddress {
  type: "email_address";
}

interface Image {
  type: "image";
}

interface Number {
  type: "number";
  editable?: boolean;
  integer?: boolean;
  max?: number;
  min?: number;
  percent?: boolean;
}

// no valid way to render -- just render with an error
interface Invalid {
  type: "invalid";
}

interface Json {
  type: "json";
  editable?: boolean;
}

interface ProjectLink {
  type: "project_link";
  project_id: string; // column with project_id
}

interface Text {
  type: "text";
  maxLen?: number;
  editable?: boolean;
}

interface TextEllipsis extends Text {
  ellipsis: true;
}

interface TextMarkdown extends Text {
  markdown: true;
}

interface Timestamp {
  type: "timestamp";
  editable?: boolean;
}

interface UUID {
  type: "uuid";
  editable?: boolean;
}

interface Usersmap {
  type: "usersmap";
  editable?: boolean;
}

export type RenderSpec =
  | AccountAvatar
  | Array
  | Blob
  | Boolean
  | Copyable
  | EmailAddress
  | Image
  | Invalid
  | Json
  | Number
  | ProjectLink
  | Text
  | TextEllipsis
  | TextMarkdown
  | Timestamp
  | UUID
  | Usersmap;
