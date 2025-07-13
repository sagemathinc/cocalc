/*
Viewer for a slides file via the share server.
*/

import { parseSyncdbFile } from "../whiteboard-editor/share/util";
import Canvas from "../whiteboard-editor/share/canvas";
import fixedElements from "./fixed-elements";

interface Props {
  content: string;
}

export default function ShareServerSlides({ content }: Props) {
  const pages = parseSyncdbFile(content, Object.values(fixedElements));
  const v: React.JSX.Element[] = [];
  let i = 0;
  for (const page of pages) {
    i += 1;
    v.push(<Canvas key={i} elements={page} mainFrameType={"slides"} />);
    v.push(<div key={`spacer-${i}`} style={{ height: "100px" }}></div>);
  }
  return <div>{v}</div>;
}
