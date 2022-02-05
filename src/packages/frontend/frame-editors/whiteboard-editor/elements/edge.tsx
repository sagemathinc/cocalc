/*
Render an edge from one node to another.

For now the following really naive approach:

Figure out center of start and end element,
then render using Pen going from start to end...

*/

import type { Element } from "../types";
import Pen from "./pen";

interface Props {
  element: Element;
}

export default function Edge({ element }: Props) {
  const eltDir = element.data?.dir
    ? { ...element, data: { ...element.data, path: element.data.dir } }
    : undefined;
  return (
    <>
      <Pen element={element} />
      {eltDir && <Pen element={eltDir} />}
    </>
  );
}
