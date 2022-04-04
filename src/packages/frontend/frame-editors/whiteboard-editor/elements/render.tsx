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
import Timer from "./timer";
import Selection from "./selection";
import Icon from "./icon";
import Chat from "./chat";
import Hide from "./hide";

export interface Props {
  element: Element;
  focused?: boolean;
  canvasScale: number;
  readOnly?: boolean;
  cursors?: { [account_id: string]: any[] };
}

export default function Render(props: Props) {
  if (props.element.hide != null) {
    return <Hide {...props} />;
  }
  switch (props.element.type) {
    case "text":
      return <Text {...props} />;
    case "icon":
      return <Icon {...props} />;
    case "note":
      return <Note {...props} />;
    case "code":
      return <Code {...props} />;
    case "frame":
      return <Frame {...props} />;
    case "pen":
      return <Pen {...props} />;
    case "timer":
      return <Timer {...props} />;
    case "chat":
      return <Chat {...props} />;
    case "selection":
      return <Selection {...props} />;
    default:
      return <Generic {...props} />;
  }
}
