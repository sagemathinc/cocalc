interface RenderBoolean {
  type: "boolean";
  editable?: boolean;
}

interface RenderCopyable {
  type: "copyable";
}

interface RenderImage {
  type: "image";
}

interface RenderJson {
  type: "json";
  editable?: boolean;
}

interface RenderProjectLink {
  type: "projectLink";
  title?: string; // if rendering has some sort of displayed title
}

interface RenderText {
  type: "text";
  maxLen?: number;
  markdown?: boolean;
  editable?: boolean;
}

interface RenderTimestamp {
  type: "timestamp";
  editable?: boolean;
}

interface RenderUsersmap {
  type: "usersmap";
  editable?: boolean;
}

export type Render =
  | RenderBoolean
  | RenderCopyable
  | RenderImage
  | RenderJson
  | RenderProjectLink
  | RenderText
  | RenderTimestamp
  | RenderUsersmap;
