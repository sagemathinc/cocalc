import { SlateElement } from "../register";

export interface Meta extends SlateElement {
  type: "meta";
  value: string;
  isVoid: true;
}

export function createMetaNode(value: string) {
  return {
    type: "meta" as "meta",
    value,
    isVoid: true as true,
    children: [{ text: "" }],
  };
}
