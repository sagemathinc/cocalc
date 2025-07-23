/*
Viewer for a whiteboard .board file via the share server.

This must be very careful about what gets imported, so that server side rendering works.
Also, obviously, it should avoid dynamic content.
*/

import { parseSyncdbFile } from "./util";
import Canvas from "./canvas";

interface Props {
  content: string;
}

export default function ShareServerWhiteBoard({ content }: Props) {
  const pages = parseSyncdbFile(content);
  const v: React.JSX.Element[] = [];
  let i = 0;
  for (const page of pages) {
    i += 1;
    v.push(<Canvas key={i} elements={page} mainFrameType={"whiteboard"} />);
    v.push(<div key={`spacer-${i}`} style={{ height: "100px" }}></div>);
  }
  return <div>{v}</div>;
}
