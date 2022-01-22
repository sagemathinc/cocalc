/*
Render any element
*/

import { Element } from "../types";
import Markdown from "./markdown";
import Generic from "./generic";

interface Props {
  element: Element;
  focused: boolean;
}

export default function Render({ element, focused }: Props) {
  /* dumb for now, but will be a cool plugin system like we used for our slate wysiwyg editor....*/

  switch (element.type) {
    case "markdown":
      return <Markdown element={element} focused={focused} />;
    default:
      return <Generic element={element} focused={focused} />;
  }
}
