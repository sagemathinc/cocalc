interface Account {
  type: "account";
}

// 0 or more account_ids
interface Accounts {
  type: "accounts";
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
}

interface Percent {
  type: "percent";
  editable?: boolean;
  steps?: number;
}

// no valid way to render -- just render with an error
interface Invalid {
  type: "invalid";
}

interface Json {
  type: "json";
  editable?: boolean;
}

interface Purchased {
  type: "purchased";
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

interface Markdown {
  type: "markdown";
  maxLen?: number;
  editable?: boolean;
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
  | Account
  | Accounts
  | Array
  | Blob
  | Boolean
  | Copyable
  | EmailAddress
  | Image
  | Invalid
  | Json
  | Number
  | Percent
  | Purchased
  | ProjectLink
  | Text
  | TextEllipsis
  | Markdown
  | Timestamp
  | UUID
  | Usersmap;
