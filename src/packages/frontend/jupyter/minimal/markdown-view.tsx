/*
 *  This file is part of CoCalc: Copyright © 2020-2026 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Button, Tooltip } from "antd";
import React, { useState } from "react";

import { Icon } from "@cocalc/frontend/components";
import MostlyStaticMarkdown from "@cocalc/frontend/editors/slate/mostly-static-markdown";
import { COLORS } from "@cocalc/util/theme";

/**
 * Rendered markdown view with a hover pencil-button to switch to edit mode.
 * Owns its own `hovered` state so the parent cell doesn't re-render on mouse
 * enter/leave over a markdown cell.
 */
export const MarkdownView: React.FC<{
  input: string;
  readOnly: boolean;
  onEdit: () => void;
  onChange?: (value: string) => void;
}> = React.memo(({ input, readOnly, onEdit, onChange }) => {
  const [hovered, setHovered] = useState(false);
  const trimmed = input.trim();
  const hasContent = !!trimmed;
  return (
    <div
      style={{ position: "relative", minHeight: "24px" }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onDoubleClick={onEdit}
    >
      {hasContent ? (
        <div className="cocalc-jupyter-rendered cocalc-jupyter-rendered-md minimal-md-render">
          <MostlyStaticMarkdown value={trimmed} onChange={onChange} />
        </div>
      ) : (
        <div
          style={{
            color: COLORS.GRAY_L,
            padding: "4px",
            fontStyle: "italic",
            cursor: "pointer",
          }}
          onClick={onEdit}
        >
          empty markdown
        </div>
      )}
      {(hovered || !hasContent) && !readOnly && (
        <Tooltip title="Edit this markdown cell" placement="top">
          <Button
            type="text"
            size="small"
            icon={<Icon name="pencil" />}
            onClick={onEdit}
            style={{
              position: "absolute",
              top: "2px",
              right: "2px",
              opacity: 0.7,
            }}
          />
        </Tooltip>
      )}
    </div>
  );
});
