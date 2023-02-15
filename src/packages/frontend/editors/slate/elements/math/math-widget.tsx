/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

// Katex support -- NOTE: this import of katex is pretty LARGE.
import "katex/dist/katex.min.css";

// Everything else.
import {
  React,
  useEffect,
  useFrameContext,
  useRef,
  useState,
} from "@cocalc/frontend/app-framework";
import { SlateCodeMirror } from "../codemirror";
import { useFocused, useSelected } from "../../slate-react";
import { useCollapsed } from "../hooks";
import { StaticElement } from "./index";

interface Props {
  value: string;
  isInline: boolean;
  onChange?: (string) => void;
}

export const SlateMath: React.FC<Props> = React.memo(
  ({ value, onChange, isInline }) => {
    const [editMode, setEditMode] = useState<boolean>(false);
    const frameContext = useFrameContext();
    const justBlurred = useRef<boolean>(false);

    const focused = useFocused();
    const selected = useSelected();
    const collapsed = useCollapsed();

    useEffect(() => {
      if (focused && selected && collapsed && !justBlurred.current) {
        setEditMode(true);
      }
    }, [selected, focused, collapsed]);

    function renderEditMode() {
      if (!editMode) return;
      return (
        <SlateCodeMirror
          style={{
            border: "1px solid lightgrey",
            boxShadow: "4px 4px 3px #aaa",
          }}
          value={value}
          onChange={(value) => {
            onChange?.(value.trim().replace(/^\s*[\r\n]/gm, ""));
          }}
          onBlur={() => {
            justBlurred.current = true;
            setTimeout(() => {
              justBlurred.current = false;
            }, 1);
            setEditMode(false);
          }}
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
          style={editMode ? { color: "#337ab7" } : undefined}
          onClick={async (e) => {
            e.preventDefault();
            e.stopPropagation();
            // switch to edit mode when you click on it.
            setEditMode?.(true);
            frameContext.actions.set_active_id(frameContext.id);
          }}
        >
          {/* below since we are abusing the StaticElement component a bit */}
          <StaticElement
            element={
              { value, type: isInline ? "math_inline" : "math_block" } as any
            }
            children={undefined}
            attributes={{} as any}
          />
        </span>
      );
    }

    return (
      <span contentEditable={false} style={{ cursor: "pointer" }}>
        {!isInline && renderEditMode()}
        {renderLaTeX()}
        {isInline && renderEditMode()}
      </span>
    );
  }
);
