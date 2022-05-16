import { SlateElement } from "../register";
import type { References as ReferencesMap } from "../../markdown-to-slate/types";

export interface References extends SlateElement {
  type: "references";
  value: ReferencesMap;
  isVoid: true;
}

export function createReferencesNode(value: ReferencesMap) {
  return {
    type: "references" as "references",
    value,
    isVoid: true as true,
    children: [{ text: "" }],
  };
}
