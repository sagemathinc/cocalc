/*
 *  This file is part of CoCalc: Copyright © 2025-2026 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
Renders alignment guide lines on the canvas during element drag operations.
These lines show snap targets (element edges/centers, page borders).
*/

import { COLORS } from "@cocalc/util/theme";

import { MAX_ELEMENTS } from "./math";
import type { SnapLine } from "./snap";
import type { Transforms } from "./math";

const GUIDE_COLOR = COLORS.ANTD_RED_WARN;
const GUIDE_WIDTH = 1; // in CSS pixels (unscaled)

interface Props {
  lines: SnapLine[];
  transforms: Transforms;
  canvasScale: number;
}

export default function SnapGuides({ lines, transforms, canvasScale }: Props) {
  if (lines.length === 0) return null;

  return (
    <>
      {lines.map((line, i) => {
        if (line.orientation === "vertical") {
          const top = transforms.dataToWindowNoScale(line.position, line.start);
          const bottom = transforms.dataToWindowNoScale(
            line.position,
            line.end,
          );
          return (
            <div
              key={`v-${i}`}
              style={{
                position: "absolute",
                left: `${top.x}px`,
                top: `${top.y}px`,
                width: `${GUIDE_WIDTH / canvasScale}px`,
                height: `${bottom.y - top.y}px`,
                background: GUIDE_COLOR,
                zIndex: MAX_ELEMENTS + 10,
                pointerEvents: "none",
              }}
            />
          );
        } else {
          const left = transforms.dataToWindowNoScale(
            line.start,
            line.position,
          );
          const right = transforms.dataToWindowNoScale(line.end, line.position);
          return (
            <div
              key={`h-${i}`}
              style={{
                position: "absolute",
                left: `${left.x}px`,
                top: `${left.y}px`,
                width: `${right.x - left.x}px`,
                height: `${GUIDE_WIDTH / canvasScale}px`,
                background: GUIDE_COLOR,
                zIndex: MAX_ELEMENTS + 10,
                pointerEvents: "none",
              }}
            />
          );
        }
      })}
    </>
  );
}
