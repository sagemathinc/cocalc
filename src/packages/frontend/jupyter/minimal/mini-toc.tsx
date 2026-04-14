/*
 *  This file is part of CoCalc: Copyright © 2020-2026 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
 * Floating mini table of contents for the left spacer column in
 * comfortable/narrow layouts (not zen, not wide).
 *
 * Shows up to 5 section entries centred on the current section,
 * with the active one highlighted darker. Each entry is a click-to-jump link.
 */

import React, { useMemo } from "react";
import type * as immutable from "immutable";
import useNotebookFrameActions from "@cocalc/frontend/frame-editors/jupyter-editor/cell-notebook/hook";
import type { JupyterActions } from "@cocalc/frontend/jupyter/browser-actions";
import type { SectionBlock } from "./types";
import { COLORS } from "@cocalc/util/theme";

const MAX_VISIBLE = 20;

interface MiniTOCProps {
  sectionBlocks: SectionBlock[];
  currentBlockIndex: number;
  cells: immutable.Map<string, any>;
  minimalLayout?: "wide" | "comfortable" | "narrow";
  fontSize?: number;
  actions?: JupyterActions;
}

export const MiniTOC: React.FC<MiniTOCProps> = React.memo(
  ({ sectionBlocks, currentBlockIndex, cells, fontSize, actions }) => {
    const frameActions = useNotebookFrameActions();

    // Build list of sections with headings (skip headingLevel === 0)
    const sections = useMemo(() => {
      const result: { blockIndex: number; title: string }[] = [];
      for (let i = 0; i < sectionBlocks.length; i++) {
        const block = sectionBlocks[i];
        if (block.headingLevel === 0) continue;
        const startCell = cells.get(block.startCellId);
        const input = startCell?.get("input") ?? "";
        const firstLine = input
          .split("\n")
          .find((l: string) => /^#{1,4}\s/.test(l.trimStart()));
        const title = firstLine?.replace(/^#+\s*/, "").trim() ?? "";
        if (title) {
          result.push({ blockIndex: i, title });
        }
      }
      return result;
    }, [sectionBlocks, cells]);

    // Find which section index in the filtered list is current
    const currentSectionIdx = useMemo(() => {
      // Find the section whose blockIndex matches or is the closest <= currentBlockIndex
      let best = 0;
      for (let i = 0; i < sections.length; i++) {
        if (sections[i].blockIndex <= currentBlockIndex) {
          best = i;
        }
      }
      return best;
    }, [sections, currentBlockIndex]);

    // Window: up to 2 above and 2 below, max 5 total
    const window = useMemo(() => {
      if (sections.length === 0) return [];
      const half = Math.floor(MAX_VISIBLE / 2);
      let start = currentSectionIdx - half;
      let end = currentSectionIdx + half;
      // Clamp
      if (start < 0) {
        end = Math.min(sections.length - 1, end + (-start));
        start = 0;
      }
      if (end >= sections.length) {
        start = Math.max(0, start - (end - sections.length + 1));
        end = sections.length - 1;
      }
      return sections.slice(start, end + 1);
    }, [sections, currentSectionIdx]);

    if (window.length === 0) return null;

    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "1px",
          padding: "4px 20px 4px 20px",
        }}
      >
        {window.map(({ blockIndex, title }) => {
          const isCurrent = blockIndex === sections[currentSectionIdx]?.blockIndex;
          return (
            <div
              key={blockIndex}
              className={isCurrent ? undefined : "mini-toc-entry"}
              onClick={() => {
                const cellId = sectionBlocks[blockIndex].startCellId;
                frameActions.current?.set_cur_id(cellId);
                frameActions.current?.scroll("cell top");
              }}
              onDoubleClick={() => {
                if (!actions) return;
                const block = sectionBlocks[blockIndex];
                const cells_map = actions.store.get("cells");
                for (const cid of block.cellIds) {
                  const c = cells_map?.get(cid);
                  if (c && (c.get("cell_type") || "code") === "code") {
                    actions.run_cell(cid, false);
                  }
                }
                actions.save_asap();
              }}
              title={actions ? `${title} — double-click to run section` : title}
              style={{
                color: isCurrent ? COLORS.GRAY_M : COLORS.GRAY_L,
                fontSize: `${Math.round((fontSize ?? 14) * 0.78)}px`,
                cursor: "pointer",
                textAlign: "right",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
                lineHeight: `${Math.round((fontSize ?? 14) * 1.15)}px`,
                fontWeight: isCurrent ? 600 : 400,
                userSelect: "none",
              }}
            >
              {title}
            </div>
          );
        })}
      </div>
    );
  },
);
