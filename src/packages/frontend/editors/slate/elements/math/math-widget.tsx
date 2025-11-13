/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
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
import { Popover } from "antd";
import { Icon } from "@cocalc/frontend/components/icon";

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

    function renderLaTeX() {
      const Element = isInline ? "span" : "div";
      return (
        <Element
          style={
            editMode
              ? {
                  color: "#337ab7",
                  border: "1px solid #337ab7",
                  borderRadius: "8px",
                  ...(isInline
                    ? { margin: "-7px -3px", padding: "6px 2px" }
                    : undefined),
                }
              : !isInline
              ? { border: "1px solid transparent" }
              : undefined
          }
          onClick={async (e) => {
            e.preventDefault();
            e.stopPropagation();
            // switch to edit mode when you click on it.
            setEditMode?.(true);
            // also make the frame containing this active... if we're in a frame editor (hence the ?. !)
            frameContext.actions?.set_active_id?.(frameContext.id);
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
        </Element>
      );
    }
    // putting renderEditMode before is critical since as we type, length of formula changes,
    // and default would move the popover as we type, which is horrible

    // !frameContext.project_id is so that this also works when using editor outside of any
    // particular project.
    const open =
      editMode &&
      ((frameContext.isFocused && frameContext.isVisible) ||
        !frameContext.project_id);

    return (
      <span contentEditable={false} style={{ cursor: "pointer" }}>
        <Popover
          open={open}
          destroyOnHidden
          title={
            <>
              <Icon name="pencil" style={{ marginRight: "5px" }} />{" "}
              {isInline ? "Inline" : "Display"} LaTeX Mathematics
            </>
          }
          content={() => (
            <SlateCodeMirror
              style={{ maxWidth: "90vw", width: "700px" }}
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
          )}
        >
          {renderLaTeX()}
        </Popover>
      </span>
    );
  },
);
