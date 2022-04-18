import { useCallback, useEffect, useRef, useState } from "react";
import { useFrameContext } from "../hooks";
import { Element } from "../types";
import { DEFAULT_FONT_SIZE } from "../tools/defaults";
import TextStatic from "./text-mostly-static";
import { getStyle, PADDING, PLACEHOLDER } from "./text-static";
export { getStyle };
import MultiMarkdownInput from "@cocalc/frontend/editors/markdown-input/multimode";
import useEditFocus from "./edit-focus";
import useMouseClickDrag from "./mouse-click-drag";
import useResizeObserver from "use-resize-observer";

const MIN_HEIGHT = 78;

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
    // NOTE: not using static whenever possible (e.g., when not focused) results
    // in massive performance problems when there are many notes.
    return <TextStatic element={props.element} />;
  }
  return <EditText {...props} />;
}

function EditText({
  element,
  canvasScale,
  cursors,
  focused,
  readOnly,
}: {
  element: Element;
  canvasScale: number;
  cursors?;
  focused?: boolean;
  readOnly?: boolean;
}) {
  const { actions } = useFrameContext();
  const [mode, setMode] = useState<string>("");
  const [editFocus, setEditFocus] = useEditFocus(false);

  // NOTE: do **NOT** autoFocus the MultiMarkdownInput.  This causes many serious problems,
  // including break first render of the overall canvas if any text is focused.

  const mouseClickDrag = useMouseClickDrag({ editFocus, setEditFocus });

  const saveEditorValue = useCallback(
    (str?) => {
      if (str == null) {
        if (!getValueRef.current) return;
        str = getValueRef.current();
      }
      if (str == (element.str ?? "")) {
        // No change so do NOT save -- see comment about similar code in code/input.tsx.
        return;
      }
      actions.setElement({
        obj: { id: element.id, str },
      });
    },
    [element.id]
  );

  // On component unmount, save any unsaved changes.
  useEffect(() => {
    return () => {
      // has to happen in different exec loop, since it updates store,
      // which updates component right as unmounted, which is a warning in react.
      setTimeout(saveEditorValue, 0);
    };
  }, []);

  const getValueRef = useRef<any>(null);

  useEffect(() => {
    if (actions._syncstring == null) return;
    actions._syncstring.on("before-change", saveEditorValue);
    return () => {
      actions._syncstring.removeListener("before-change", saveEditorValue);
      saveEditorValue();
    };
  }, [element.id]);

  // Automatic resizing:
  const divRef = useRef<HTMLDivElement>(null);
  const resize = useResizeObserver({
    // only listen if editable -- otherwise we might create tons of these, which is wasteful
    ref: readOnly || !editFocus ? undefined : divRef,
  });
  const resizeRef = useRef<Function | null>(null);
  useEffect(() => {
    if (readOnly || !editFocus) {
      resizeRef.current = null;
      return;
    }
    resizeRef.current = () => {
      // NOTE: we test that element.str == getValueRef.current?.() in order to tell
      // if you were just in undo mode, but then typed something new in the editor, which
      // hasn't yet triggered onChange.  E.g., if you type, then undo, then type something
      // to change the height, resize wouldn't bet triggered without this clause.
      if (
        readOnly ||
        (actions.in_undo_mode() && element.str == getValueRef.current?.())
      ) {
        return;
      }
      const elt = divRef.current;
      if (elt == null) return;
      const height = Math.max(
        (elt.getBoundingClientRect()?.height ?? 0) / canvasScale +
          2 * PADDING +
          2 +
          15,
        MIN_HEIGHT
      );
      actions.setElement({
        obj: { id: element.id, h: height },
        commit: false,
      });
    };
  }, [canvasScale, element.id, editFocus, readOnly]);
  useEffect(() => {
    resizeRef.current?.();
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
      <div ref={divRef}>
        {/* Important: do NOT set cacheId; for some reason restoring selection in markdown (=codemirror) mode
            breaks the whiteboard layout badly; it's also probably not a very intuitive feature in a whiteboard,
            whereas it makes a lot of sense, e.g., in a Jupyter notebook.
            Reproduce the weird behavior in a whiteod with cacheId.
            1. Open new whiteboard and create a note.
            2. Edit it in Markdown mode
            3. Close whiteboard, then open it again.
            4. Gone!
            The problem is that opening it immediately restores selection, and that breaks something about
            CSS/layout/etc.  Not sure why, but I'm ok with not having this feature.
            */}
        <MultiMarkdownInput
          getValueRef={getValueRef}
          fixedMode={element.rotate || !focused ? "editor" : undefined}
          refresh={canvasScale}
          noVfill
          minimal
          hideHelp
          placeholder={PLACEHOLDER}
          isFocused={editFocus && focused}
          onFocus={() => {
            setEditFocus(true);
            // NOTE: we do not do "setEditFocus(false)" with onBlur, because
            // there are many ways to "blur" the slate editor technically, but
            // still want to consider it focused, e.g., editing math and code
            // cells, and clicking a checkbox.
          }}
          value={element.str}
          fontSize={element.data?.fontSize ?? DEFAULT_FONT_SIZE}
          onChange={
            saveEditorValue /* MultiMarkdownInput's onChange is debounced by default */
          }
          cmOptions={{
            lineNumbers: false, // implementation of line numbers in codemirror is incompatible with CSS scaling, so ensure disabled, even if on in account prefs
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
            paddingRight: 0, // undoing a temporary hack
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
    </div>
  );
}
