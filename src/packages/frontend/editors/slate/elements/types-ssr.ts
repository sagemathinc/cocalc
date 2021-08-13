// Register types for use in server side rendering.

import "./paragraph";
import "./heading";
import "./blockquote";
import "./generic";
import "./math";
import "./code-block";
import "./break";
import "./checkbox";

import { Element } from "slate";

export function isElementOfType(x, type: string | string[]): boolean {
  return (
    Element.isElement(x) &&
    ((typeof type == "string" && x["type"] == type) ||
      (typeof type != "string" && type.indexOf(x["type"]) != -1))
  );
}
