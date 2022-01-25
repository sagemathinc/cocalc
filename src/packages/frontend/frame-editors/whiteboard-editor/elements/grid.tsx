/*
The background grid.
*/

import { CSSProperties } from "react";

const GRID = {
  backgroundPosition: "-1.5px -1.5px, -1.5px -1.5px, -1px -1px, -1px -1px",
  backgroundSize: "100px 100px, 100px 100px, 20px 20px, 20px 20px",
  backgroundImage:
    "linear-gradient(#efefef 1.5px, transparent 1.5px), linear-gradient(90deg, #efefef 1.5px, transparent 1.5px), linear-gradient(#f8f8f8 1px, transparent 1px), linear-gradient(90deg, #f8f8f8 1px, transparent 1px)",
} as CSSProperties;

export default function Grid({ transforms, divRef }) {
  return (
    <div
      ref={divRef}
      style={{
        width: `${transforms.width / transforms.scale}px`,
        height: `${transforms.height / transforms.scale}px`,
        ...GRID,
      }}
    ></div>
  );
}
