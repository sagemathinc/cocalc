/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { React, useEffect, useMemo, useState } from "../../../../app-framework";
import { macros } from "../../../../jquery-plugins/math-katex";
import { renderToString } from "katex";
import { startswith } from "smc-util/misc";
import { SlateCodeMirror } from "./codemirror";
import * as LRU from "lru-cache";
import { useFocused, useSelected } from "../slate-react";
import { useCollapsed } from "../elements/register";
import { FOCUSED_COLOR } from "../util";
import { delay } from "awaiting";

const cache = new LRU({ max: 300 });

interface Props {
  value: string;
  onChange?: (string) => void;
}

export const SlateMath: React.FC<Props> = React.memo(({ value, onChange }) => {
  const [editMode, setEditMode] = useState<boolean>(false);

  const { err, __html } = useMemo(() => mathToHtml(value), [value]);

  const focused = useFocused();
  const selected = useSelected();
  const collapsed = useCollapsed();

  useEffect(() => {
    if (focused && selected && collapsed) {
      setEditMode(true);
    }
  }, [selected, focused, collapsed]);

  function renderEditMode() {
    if (!editMode) return;
    return (
      <SlateCodeMirror
        value={value}
        onChange={(value) => {
          if (onChange == null) return;
          onChange(ensureMathMode(value));
        }}
        onBlur={() => setEditMode(false)}
        info="tex"
        options={{
          lineWrapping: true,
          autofocus: true,
        }}
        isInline={true}
      />
    );
  }

  function renderLaTeX() {
    return (
      <span
        onClick={async () => {
          // switch to edit mode when you click on it.
          await delay(0);
          setEditMode?.(true);
        }}
      >
        {err ? (
          <span
            style={{
              backgroundColor: "#fff2f0",
              border: "1px solid #ffccc7",
              padding: "5px 10px",
            }}
          >
            {err}
          </span>
        ) : (
          <span dangerouslySetInnerHTML={{ __html }}></span>
        )}
      </span>
    );
  }

  return (
    <span
      style={
        editMode
          ? {
              display: "block",
              padding: "10px",
              cursor: "pointer",
              border: "1px solid lightgrey",
              boxShadow: "8px 8px 4px #888",
              borderRadius: "5px",
              margin: "5px 10%",
            }
          : {
              display: startswith(value, "$$") ? "block" : "inline",
              cursor: "pointer",
              border:
                focused && selected ? `1px solid ${FOCUSED_COLOR}` : undefined,
            }
      }
    >
      {renderEditMode()}
      {renderLaTeX()}
    </span>
  );
});

function isDisplayMode(math: string): boolean {
  return startswith(math, "$$") && math.length > 2;
}

function mathToHtml(
  math: string // either $latex$ or $$latex$$
): { __html: string; err?: string } {
  let { html, err, displayMode } = (cache.get(math) ?? {}) as any;
  if (displayMode == null) {
    displayMode = isDisplayMode(math);
    const i = displayMode ? 2 : 1;
    let code = math.slice(i, math.length - i).trim();
    if (!code) {
      code = "\\LaTeX";
    }
    try {
      html = renderToString(code, {
        displayMode,
        macros,
      });
    } catch (error) {
      err = error.toString();
    }
    cache.set(math, { html, err, displayMode });
  }
  return { __html: html ?? "", err };
}

// ensure value is always math to not weirdly break document.
function ensureMathMode(value: string): string {
  return (
    (value[0] != "$" ? "$" : "") +
    value +
    (value[value.length - 1] != "$" ? "$" : "")
  );
}
