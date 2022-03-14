import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useFrameContext } from "../hooks";
import { Element } from "../types";
import { DEFAULT_FONT_SIZE } from "../tools/defaults";
import TextStatic, { getStyle, PADDING, PLACEHOLDER } from "./text-static";
export { getStyle };
import { useIsMountedRef } from "@cocalc/frontend/app-framework";
import { debounce } from "lodash";
import MultiMarkdownInput from "@cocalc/frontend/editors/markdown-input/multimode";
import { three_way_merge as threeWayMerge } from "@cocalc/sync/editor/generic/util";
import { SAVE_DEBOUNCE_MS } from "@cocalc/frontend/frame-editors/code-editor/const";

interface Props {
  element: Element;
  focused?: boolean;
  canvasScale: number;
  readOnly?: boolean;
  noteMode?: boolean; // used for sticky note
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
  noteMode,
  cursors,
  focused,
}: {
  element: Element;
  canvasScale: number;
  noteMode?: boolean;
  cursors?;
  focused?: boolean;
}) {
  const { actions, id: frameId, desc } = useFrameContext();
  const expandIfNecessary = useCallback(() => {
    // possibly adjust height.  We do this in the next render
    // loop because sometimes when the change fires the dom
    // hasn't updated the height of the containing div yet,
    // so we end up setting the height 1 step behind reality.
    // We never make the height smaller -- user can manually do that.
    const elt = editorDivRef.current;
    if (elt == null) return;
    const height = (elt.offsetHeight ?? 0) + 2 * PADDING + 2 + 15;
    if (height > (element.h ?? 0)) {
      actions.setElement({
        obj: { id: element.id, h: height },
        commit: false,
      });
    }
  }, [element]);
  const isMounted = useIsMountedRef();
  const [value, setValue] = useState<string>(element.str ?? "");
  const [mode, setMode] = useState<string>("");

  const [editFocus, setEditFocus0] = useState<boolean>(false);
  const setEditFocus = (state: boolean) => {
    setEditFocus0(state);
    actions.setEditFocus(frameId, state);
  };
  useEffect(() => {
    if (editFocus && !desc.get("editFocus")) {
      setEditFocus0(false);
    }
  }, [desc.get("editFocus")]);

  const editorDivRef = useRef<HTMLDivElement>(null);
  const lastRemote = useRef<string>(element.str ?? "");
  const valueRef = useRef<string>(value);
  const setting = useRef<boolean>(false);
  const save = useMemo(() => {
    return debounce(() => {
      if (!isMounted.current || lastRemote.current == valueRef.current) return;
      lastRemote.current = valueRef.current;
      try {
        setting.current = true;
        actions.setElement({ obj: { id: element.id, str: valueRef.current } });
      } finally {
        setting.current = false;
      }
    }, SAVE_DEBOUNCE_MS);
  }, []);

  useEffect(() => {
    if (setting.current) return;
    const base = lastRemote.current;
    const remote = element.str ?? "";
    const newVal = threeWayMerge({
      base,
      local: valueRef.current,
      remote,
    });
    if (newVal != valueRef.current) {
      valueRef.current = newVal;
      lastRemote.current = remote;
      setValue(newVal);
    }
  }, [element.str]);

  useEffect(() => {
    return () => {
      actions.setElement({ obj: { id: element.id, str: valueRef.current } });
    };
  }, []);

  useEffect(save, [value]);

  // NOTE: do **NOT** autoFocus the MultiMarkdownInput.  This causes many serious problems,
  // including break first render of the overall canvas if any text is focused.
  const mousePosRef = useRef<number[] | true>([]);
  return (
    <div
      onMouseDown={(e) => {
        if (editFocus) {
          mousePosRef.current = true;
          return;
        }
        mousePosRef.current = [e.clientX, e.clientY];
      }}
      onMouseUp={(e) => {
        if (mousePosRef.current === true) return;
        // NOTE: in raw markdown source mode we don't get the mouseDown click, so always focus.
        if (
          mousePosRef.current.length == 0 ||
          (e.clientX == mousePosRef.current?.[0] &&
            e.clientY == mousePosRef.current?.[1])
        ) {
          setEditFocus(true);
        } else {
          // defocus on move
          setEditFocus(false);
        }
        mousePosRef.current = [];
      }}
      style={{
        ...getStyle(element),
        padding: noteMode
          ? `${PADDING + 15}px`
          : `${PADDING}px ${PADDING}px 0 ${PADDING}px `,
        height: "100%",
      }}
      className={editFocus ? "nodrag" : undefined}
    >
      <MultiMarkdownInput
        fixedMode={element.rotate || !focused ? "editor" : undefined}
        cacheId={element.id}
        refresh={canvasScale}
        noVfill
        minimal
        hideHelp
        placeholder={PLACEHOLDER}
        editorDivRef={editorDivRef}
        isFocused={editFocus}
        onFocus={() => {
          setEditFocus(true);
          expandIfNecessary();
          // NOTE: we do not do "setEditFocus(false)" with onBlur, because
          // there are many ways to "blur" the slate editor technically, but
          // still want to consider it focused, e.g., editing math and code
          // cells, and clicking a checkbox.
        }}
        onShiftEnter={() => {
          const id = actions.createAdjacentElement(element.id, "bottom");
          if (!id) return;
          actions.setSelectedTool(frameId, "select");
          actions.setSelection(frameId, id);
          actions.centerElement(id);
        }}
        value={value}
        fontSize={element.data?.fontSize ?? DEFAULT_FONT_SIZE}
        onChange={(value) => {
          valueRef.current = value;
          setValue(value);
          setTimeout(expandIfNecessary, 0);
        }}
        onModeChange={setMode}
        editBarStyle={{
          visibility: !focused || mode == "markdown" ? "hidden" : undefined,
          top: noteMode ? "-32px" : `${-55 - 5 / canvasScale}px`,
          left: "-24px",
          position: "absolute",
          boxShadow: "1px 3px 5px #ccc",
          margin: "5px",
          minWidth: "500px",
          background: "white",
          transform: noteMode
            ? `scale(${Math.min(0.8, 1 / canvasScale)})`
            : `scale(${1 / canvasScale})`,
          transformOrigin: "bottom left",
          fontFamily: "sans-serif",
        }}
        modeSwitchStyle={{
          top: noteMode || mode == "markdown" ? "-54px" : "-82px",
          right: "-24px",
          transform: `scale(${1 / Math.max(1, canvasScale)})`,
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
      />
    </div>
  );
}
