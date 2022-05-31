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
  const v: JSX.Element[] = [];
  for (const page of pages) {
    v.push(<Canvas elements={page} />);
    v.push(<div style={{ height: "100px" }}></div>);
  }
  return <div>{v}</div>;
}
