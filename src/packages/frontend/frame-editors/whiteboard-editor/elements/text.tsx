import { useCallback, useEffect, useRef, useState } from "react";
import { useFrameContext } from "../hooks";
import { Element } from "../types";
import { DEFAULT_FONT_SIZE } from "../tools/defaults";
import TextStatic, { getStyle, PADDING, PLACEHOLDER } from "./text-static";
export { getStyle };
import MultiMarkdownInput from "@cocalc/frontend/editors/markdown-input/multimode";
import useEditFocus from "./edit-focus";
import useMouseClickDrag from "./mouse-click-drag";
import useResizeObserver from "use-resize-observer";

interface Props {
  element: Element;
  focused?: boolean;
  canvasScale: number;
  readOnly?: boolean;
  cursors?: { [account_id: string]: any[] };
}

export default function Text(props: Props) {
  if (
    (props.readOnly || !props.focused || props.element.locked) &&
    props.cursors == null
  ) {
    return <TextStatic element={props.element} />;
  }
  return <EditText {...props} />;
}

function EditText({
  element,
  canvasScale,
  cursors,
  focused,
}: {
  element: Element;
  canvasScale: number;
  cursors?;
  focused?: boolean;
}) {
  const { actions, id: frameId } = useFrameContext();
  const resizeIfNecessary = useCallback(() => {
    if (actions.in_undo_mode()) return;
    // possibly adjust height.  We do this in the next render
    // loop because sometimes when the change fires the dom
    // hasn't updated the height of the containing div yet,
    // so we end up setting the height 1 step behind reality.
    const elt = editorDivRef.current;
    if (elt == null) return;
    const height = (elt.offsetHeight ?? 0) + 2 * PADDING + 2 + 15;
    actions.setElement({
      obj: { id: element.id, h: height },
      commit: false,
    });
  }, [element]);
  const [mode, setMode] = useState<string>("");

  const [editFocus, setEditFocus] = useEditFocus(false);

  const editorDivRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    return () => {
      actions.setElement({
        obj: { id: element.id, str: getValueRef.current() },
      });
    };
  }, []);

  // NOTE: do **NOT** autoFocus the MultiMarkdownInput.  This causes many serious problems,
  // including break first render of the overall canvas if any text is focused.

  const mouseClickDrag = useMouseClickDrag({ editFocus, setEditFocus });

  const getValueRef = useRef<any>(null);
  useEffect(() => {
    if (actions._syncstring == null) return;
    const beforeChange = () => {
      const str = getValueRef.current();
      actions.setElement({
        obj: { id: element.id, str },
      });
    };
    actions._syncstring.on("before-change", beforeChange);
    return () => {
      actions._syncstring.removeListener("before-change", beforeChange);
    };
  }, []);

  const resize = useResizeObserver({ ref: editorDivRef });
  useEffect(() => {
    resizeIfNecessary();
  }, [resize]);

  return (
    <div
      {...mouseClickDrag}
      style={{
        ...getStyle(element),
        padding: `${PADDING}px ${PADDING}px 0 ${PADDING}px `,
        height: "100%",
      }}
      className={editFocus ? "nodrag" : undefined}
    >
      <MultiMarkdownInput
        getValueRef={getValueRef}
        fixedMode={element.rotate || !focused ? "editor" : undefined}
        cacheId={element.id}
        refresh={canvasScale}
        noVfill
        minimal
        hideHelp
        placeholder={PLACEHOLDER}
        editorDivRef={editorDivRef}
        isFocused={editFocus && focused}
        onFocus={() => {
          setEditFocus(true);
          resizeIfNecessary();
          // NOTE: we do not do "setEditFocus(false)" with onBlur, because
          // there are many ways to "blur" the slate editor technically, but
          // still want to consider it focused, e.g., editing math and code
          // cells, and clicking a checkbox.
        }}
        onShiftEnter={() => {
          setEditFocus(false);
          actions.clearSelection(frameId);
        }}
        value={element.str}
        fontSize={element.data?.fontSize ?? DEFAULT_FONT_SIZE}
        onChange={(value) => {
          actions.setElement({ obj: { id: element.id, str: value } });
          setTimeout(resizeIfNecessary, 0);
        }}
        onModeChange={setMode}
        editBarStyle={{
          visibility: !focused || mode == "markdown" ? "hidden" : undefined,
          top: `${-55 - 5}px`,
          left: "-24px",
          position: "absolute",
          boxShadow: "1px 3px 5px #ccc",
          margin: "5px",
          minWidth: "500px",
          background: "white",
          fontFamily: "sans-serif",
        }}
        modeSwitchStyle={{
          top: "-82px",
          left: "-18px",
        }}
        onCursors={(cursors) => {
          actions.setCursors(element.id, cursors);
        }}
        cursors={cursors}
        onSave={() => {
          actions.save(true);
        }}
        onUndo={() => {
          actions.undo();
        }}
        onRedo={() => {
          actions.redo();
        }}
        compact
      />
    </div>
  );
}
