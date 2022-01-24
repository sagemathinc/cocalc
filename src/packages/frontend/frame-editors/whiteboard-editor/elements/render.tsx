/*
Render any element
*/

import { Element } from "../types";
import Text from "./text";
import Note from "./note";
import Code from "./code";
import Generic from "./generic";

interface Props {
  element: Element;
  focused: boolean;
}

export default function Render({ element, focused }: Props) {
  /* dumb for now, but will be a cool plugin system like we used for our slate wysiwyg editor....*/

  switch (element.type) {
    case "text":
      return <Text element={element} focused={focused} />;
    case "note":
      return <Note element={element} focused={focused} />;
    case "code":
      return <Code element={element} focused={focused} />;
    default:
      return <Generic element={element} focused={focused} />;
  }
}
