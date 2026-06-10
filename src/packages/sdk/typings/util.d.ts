declare module "@cocalc/util" {
  export type JsonPrimitive = boolean | number | string | null;
  export type JsonValue =
    | JsonPrimitive
    | { [key: string]: JsonValue }
    | JsonValue[];
}
