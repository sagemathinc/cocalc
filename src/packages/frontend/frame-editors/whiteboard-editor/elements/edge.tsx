/*
Render an edge from one node to another.

For now the following really naive approach:

Figure out center of start and end element,
then render using Pen going from start to end...

*/

import type { Element } from "../types";
import { useEditorRedux } from "@cocalc/frontend/app-framework";
import { useFrameContext } from "../hooks";
import Generic from "./generic";
import { centerOfRect } from "../math";

import Pen from "./pen";

interface Props {
  element: Element;
}

export default function Edge({ element }: Props) {
  const { project_id, path } = useFrameContext();
  // TODO: This is not the best way to get the adjacent elements to this component, and would
  // mean all edges update everytime anything changes.
  const useEditor = useEditorRedux<any>({ project_id, path });
  const elements = useEditor("elements");
  const { from, to } = element.data ?? {};
  if (!from || !to) return <Generic element={element} />;
  const f = elements.get(from)?.toJS();
  const t = elements.get(to)?.toJS();
  if (!f || !t) return <Generic element={element} />; // TODO: arrow to/from nowhere

  const p0 = centerOfRect(f);
  const p1 = centerOfRect(t);
  const x = Math.min(p0.x, p1.x);
  const y = Math.min(p0.y, p1.y);
  const w = Math.max(p0.x, p1.x) - x + 1;
  const h = Math.max(p0.y, p1.y) - y + 1;

  return (
    <Pen
      element={{
        id: "tempory",
        type: "pen",
        x,
        y,
        w,
        h,
        data: {
          ...element.data,
          path: [p0.x - x, p0.y - y, p1.x - x, p1.y - y],
        },
      }}
    />
  );
}
