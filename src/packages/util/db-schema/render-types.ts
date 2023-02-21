interface Account {
  type: "account";
}

// 0 or more account_ids
interface Accounts {
  type: "accounts";
  editable?: boolean;
}

interface Array {
  type: "array";
  ofType: "text" | "json";
}

interface Assignee {
  type: "assignee";
  editable?: boolean;
}

interface Blob {
  type: "blob";
}

interface Boolean {
  type: "boolean";
  editable?: boolean;
  whenField?: string; // set timestamp of this field when editing to true; clear when false
}

interface Color {
  type: "color";
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
  editable?: boolean;
}

interface Number {
  type: "number";
  editable?: boolean;
  integer?: boolean;
  format?: "money" | "percent";
  max?: number;
  min?: number;
  step?: number;
}

interface Organizations {
  type: "organizations";
  editable?: boolean;
}

interface Percent {
  type: "percent";
  editable?: boolean;
  steps?: number;
}

interface Icon {
  type: "icon";
  editable?: boolean;
}

// no valid way to render -- just render with an error
interface Invalid {
  type: "invalid";
}

interface Json {
  type: "json";
  editable?: boolean;
}

interface JsonString {
  type: "json-string";
}

interface People {
  type: "people";
  editable?: boolean;
}

interface Person {
  type: "person";
  editable?: boolean;
}

interface Purchased {
  type: "purchased";
}

interface ProjectLink {
  type: "project_link";
  project_id?: string; // column with project_id
}

interface Select {
  type: "select";
  options: string[];
  colors?: string[];
  editable?: boolean;
  priority?: boolean;
}

export interface Text {
  type: "text";
  maxLength?: number;
  editable?: boolean;
  tag?: boolean;
}

interface TextEllipsis extends Text {
  ellipsis: true;
}

interface Markdown {
  type: "markdown";
  maxLength?: number;
  editable?: boolean;
}

interface Tags {
  type: "tags";
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
  | Assignee
  | Blob
  | Boolean
  | Color
  | Copyable
  | EmailAddress
  | Icon
  | Image
  | Invalid
  | Json
  | JsonString
  | Number
  | Organizations
  | People
  | Person
  | Percent
  | Purchased
  | ProjectLink
  | Select
  | Tags
  | Text
  | TextEllipsis
  | Markdown
  | Timestamp
  | UUID
  | Usersmap;
