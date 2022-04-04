/*
Render anything, but only using code suitable to run in next.js
*/

import { Element } from "../types";
import Generic from "./generic";
import Text from "./text-static";
import Note from "./note-static";
import Icon from "./icon";
import Pen from "./pen";
import Code from "./code/static";
import Frame from "./frame";
import Timer from "./timer-static";
import Chat from "./chat-static";

export interface Props {
  element: Element;
  canvasScale?: number;
}

export default function RenderStatic(props) {
  if (props.element.hide) {
    // don't show hidden objects at all.
    return null;
  }
  switch (props.element.type) {
    case "text":
      return <Text {...props} />;
    case "note":
      return <Note {...props} />;
    case "icon":
      return <Icon {...props} />;
    case "pen":
      return <Pen {...props} renderStatic />;
    case "code":
      return <Code {...props} />;
    case "frame":
      return <Frame {...props} />;
    case "timer":
      return <Timer {...props} />;
    case "chat":
      return <Chat {...props} />;
    default:
      return <Generic {...props} />;
  }
}
