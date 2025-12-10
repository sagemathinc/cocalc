import { CSSProperties, useEffect, useRef, useState, useCallback } from "react";
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
import { SimpleInputMerge } from "@cocalc/sync/editor/generic/simple-input-merge";

const MIN_HEIGHT = 78;

interface Props {
  element: Element;
  focused?: boolean;
  canvasScale: number;
  readOnly?: boolean;
  cursors?: { [account_id: string]: any[] };
  markdownProps?: object;
  resizable?: boolean;
  style?: CSSProperties;
}

export default function Text(props: Props) {
  const [mode, setMode] = useState<string>("");
  return (
    <TextEditor
      resizable
      {...props}
      markdownProps={{
        onModeChange: setMode,
        editBarStyle: {
          visibility:
            !props.focused || mode == "markdown" ? "hidden" : undefined,
        },
        modeSwitchStyle: {
          top: "-82px",
          left: "-18px",
        },
        placeholder: props.element.data?.placeholder ?? PLACEHOLDER,
        noVfill: true,
        minimal: true,
        compact: true,
        hideHelp: true,
      }}
    />
  );
}

// This is less specialized to the whiteboard.  E.g., it is
// more reusable, for speaker notes.
export function TextEditor(props: Props) {
  if (
    (props.readOnly || !props.focused || props.element.locked) &&
    props.cursors == null
  ) {
    // NOTE: not using static whenever possible (e.g., when not focused) results
    // in massive performance problems when there are many notes.
    return <TextStatic element={props.element} style={props.style} />;
  }
  return <EditText {...props} />;
}

function EditText({
  element,
  canvasScale,
  cursors,
  focused,
  readOnly,
  markdownProps,
  resizable,
}: {
  element: Element;
  canvasScale: number;
  cursors?;
  focused?: boolean;
  readOnly?: boolean;
  markdownProps?: object;
  resizable?: boolean;
}) {
  const { actions } = useFrameContext();
  const [editFocus, setEditFocus] = useEditFocus(false);
  const getValueRef = useRef<any>(null);
  const saveValueRef = useRef<any>(() => {});
  const dirtyRef = useRef<boolean>(false);
  const [localValue, setLocalValue] = useState<string>(
    element.str ?? element.data?.initStr ?? "",
  );
  const mergeHelperRef = useRef<SimpleInputMerge>(
    new SimpleInputMerge(element.str ?? element.data?.initStr ?? ""),
  );
  const saveAndResetDirty = useCallback(() => {
    const current = getValueRef.current?.() ?? "";
    dirtyRef.current = false;
    setLocalValue(current);
    actions.setElement({ obj: { id: element.id, str: current } });
    mergeHelperRef.current.noteSaved(current);
  }, [actions, element.id]);

  // NOTE: do **NOT** autoFocus the MultiMarkdownInput.  This causes many serious problems,
  // including break first render of the overall canvas if any text is focused.

  const mouseClickDrag = useMouseClickDrag({ editFocus, setEditFocus });

  // Reset baseline when switching elements.
  useEffect(() => {
    const initial = element.str ?? element.data?.initStr ?? "";
    setLocalValue(initial);
    mergeHelperRef.current.reset(initial);
  }, [element.id]);

  // Merge incoming remote updates with local edits preserved.
  useEffect(() => {
    const remote = element.str ?? element.data?.initStr ?? "";
    mergeHelperRef.current.handleRemote({
      remote,
      getLocal: () => getValueRef.current?.() ?? localValue,
      applyMerged: (v) => {
        setLocalValue(v);
        actions.setElement({ obj: { id: element.id, str: v } });
      },
    });
  }, [element.str]);

  // Save current buffer to the store (optionally using provided string).
  useEffect(() => {
    saveValueRef.current = (str?) => {
      if (!dirtyRef.current) {
        return;
      }
      const current = str ?? getValueRef.current?.() ?? "";
      dirtyRef.current = false;
      setLocalValue(current);
      actions.setElement({ obj: { id: element.id, str: current } });
      mergeHelperRef.current.noteSaved(current);
    };
    return () => {
      saveValueRef.current();
    };
  }, [element.id, actions]);

  // On component unmount, save any unsaved changes.
  useEffect(() => {
    return () => {
      // has to happen in different exec loop, since it updates store,
      // which updates component right as unmounted, which is a warning in react.
      const str = getValueRef.current?.();
      setTimeout(() => saveValueRef.current(str), 1);
    };
  }, []);

  // Automatic resizing:
  const divRef = useRef<HTMLDivElement>(null as any);
  const resize = useResizeObserver({
    // only listen if editable -- otherwise we might create tons of these, which is wasteful
    ref: readOnly || !editFocus ? undefined : divRef,
  });
  const resizeRef = useRef<Function | null>(null);
  useEffect(() => {
    if (!resizable || readOnly || !editFocus) {
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
        (actions.in_undo_mode() && element.str == getValueRef.current?.()) ||
        element.rotate // auto resize for rotated text doesn't work at all (it's actively very bad, so best to just diable it).
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
        MIN_HEIGHT,
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

  /* Important: do NOT set cacheId for MultiMarkdownInput; for some reason restoring selection in markdown (=codemirror) mode
      breaks the whiteboard layout badly; it's also probably not a very intuitive feature in a whiteboard,
      whereas it makes a lot of sense, e.g., in a Jupyter notebook.
      Reproduce the weird behavior in a whiteboard with cacheId.
      1. Open new whiteboard and create a note.
      2. Edit it in Markdown mode
      3. Close whiteboard, then open it again.
      4. Gone!
      The problem is that opening it immediately restores selection, and that breaks something about
      CSS/layout/etc.  Not sure why, but I'm ok with not having this feature for now.
  */
  const mergedMarkdownProps = {
    ...markdownProps,
    onModeChange: (mode: string) => {
      // Save current edits before mode switch to avoid losing buffer during re-render.
      saveAndResetDirty();
      const handler = (markdownProps as any)?.onModeChange;
      if (typeof handler === "function") {
        handler(mode);
      }
    },
  };

  const body = (
    <MultiMarkdownInput
      dirtyRef={dirtyRef}
      getValueRef={getValueRef}
      fixedMode={element.rotate || !focused ? "editor" : undefined}
      refresh={canvasScale}
      isFocused={editFocus && focused}
      onFocus={() => {
        setEditFocus(true);
        // NOTE: we do not do "setEditFocus(false)" with onBlur, because
        // there are many ways to "blur" the slate editor technically, but
        // still want to consider it focused, e.g., editing math and code
        // cells, and clicking a checkbox.
      }}
      value={localValue}
      fontSize={element.data?.fontSize ?? DEFAULT_FONT_SIZE}
      onChange={() => {
        saveValueRef.current?.();
      }}
      cmOptions={{
        lineNumbers: false, // implementation of line numbers in codemirror is incompatible with CSS scaling, so ensure disabled, even if on in account prefs
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
      {...mergedMarkdownProps}
    />
  );

  if (!resizable) {
    return body;
  }

  return (
    <div
      {...(mouseClickDrag ?? {})}
      style={{
        ...getStyle(element),
        padding: `${PADDING}px`,
        height: "100%",
      }}
      className={editFocus ? "nodrag" : undefined}
    >
      <div ref={divRef}>{body}</div>
    </div>
  );
}
