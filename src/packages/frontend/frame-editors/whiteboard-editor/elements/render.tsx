/*
Render any element
*/

import { Element } from "../types";
import Text from "./text";
import Note from "./note";
import Code from "./code";
import Frame from "./frame";
import Generic from "./generic";
import Pen from "./pen";

interface Props {
  element: Element;
  focused: boolean;
  canvasScale: number;
}

export default function Render({ element, focused, canvasScale }: Props) {
  /* dumb for now, but will be a cool plugin system like we used for our slate wysiwyg editor....*/

  switch (element.type) {
    case "text":
      return <Text element={element} focused={focused} />;
    case "note":
      return <Note element={element} focused={focused} />;
    case "code":
      return <Code element={element} focused={focused} />;
    case "frame":
      return (
        <Frame element={element} focused={focused} canvasScale={canvasScale} />
      );
    case "pen":
      return <Pen element={element} focused={focused} />;
    default:
      return <Generic element={element} focused={focused} />;
  }
}
