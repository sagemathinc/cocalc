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
import Stopwatch from "./stopwatch";
import Selection from "./selection";

interface Props {
  element: Element;
  focused: boolean;
  canvasScale: number;
}

export default function Render(props: Props) {
  /* dumb for now, but will be a cool plugin system like we used for our slate wysiwyg editor....*/

  switch (props.element.type) {
    case "text":
      return <Text {...props} />;
    case "note":
      return <Note {...props} />;
    case "code":
      return <Code {...props} />;
    case "frame":
      return <Frame {...props} />;
    case "pen":
      return <Pen {...props} />;
    case "stopwatch":
      return <Stopwatch {...props} />;
    case "selection":
      return <Selection {...props} />;
    default:
      return <Generic {...props} />;
  }
}
