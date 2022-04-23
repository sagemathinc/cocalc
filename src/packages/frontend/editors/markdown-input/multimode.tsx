/*
Edit with either plain text input **or** WYSIWYG slate-based input.
*/

import { MutableRefObject, useEffect } from "react";
import { Radio } from "antd";
import "@cocalc/frontend/editors/slate/elements/math/math-widget";
import { EditableMarkdown } from "@cocalc/frontend/editors/slate/editable-markdown";
import { MarkdownInput } from "./component";
import {
  CSSProperties,
  ReactNode,
  RefObject,
  useMemo,
  useRef,
  useState,
} from "react";
import { useFrameContext } from "@cocalc/frontend/frame-editors/frame-tree/frame-context";
import { FOCUSED_STYLE, BLURED_STYLE } from "./component";
import { fromJS, Map as ImmutableMap } from "immutable";
import LRU from "lru-cache";
import { SAVE_DEBOUNCE_MS } from "@cocalc/frontend/frame-editors/code-editor/const";

export interface EditorFunctions {
  set_cursor?: (pos: { x?: number; y?: number }) => void;
}

interface MultimodeState {
  mode?: Mode;
  markdown?: any;
  editor?: any;
}

const multimodeStateCache = new LRU<string, MultimodeState>({ max: 500 });

// markdown uses codemirror
// editor uses slate.  TODO: this should be "text", not "editor".  Oops.
export type Mode = "markdown" | "editor";

const LOCAL_STORAGE_KEY = "markdown-editor-mode";

interface Props {
  cacheId?: string; // unique **within this file**; the project_id and path are automatically also used
  value?: string;
  defaultMode?: Mode; // defaults to editor or whatever was last used (as stored in localStorage)
  fixedMode?: Mode; // only use this mode; no option to switch
  onChange: (value: string) => void;

  // use getValueRef to obtain a function getValueRef.current() that returns the current
  // value of the editor *NOW*, without waiting for onChange. Even with saveDebounceMs=0,
  // there is definitely no guarantee that onChange is always up to date, but definitely
  // up to date values are required to implement realtime sync!
  getValueRef?: MutableRefObject<() => string>;

  onModeChange?: (mode: Mode) => void;
  onShiftEnter?: (value: string) => void;
  placeholder?: string;
  fontSize?: number;
  height?: string; // css height and also "auto" is fully supported.
  style?: CSSProperties;
  modeSwitchStyle?: CSSProperties;
  autoFocus?: boolean; // note - this is broken on safari for the slate editor, but works on chrome and firefox.
  enableMentions?: boolean;
  enableUpload?: boolean; // whether to enable upload of files via drag-n-drop or paste.  This is on by default! (Note: not possible to disable for slate editor mode anyways.)
  onUploadStart?: () => void;
  onUploadEnd?: () => void;
  submitMentionsRef?: any;
  extraHelp?: ReactNode;
  hideHelp?: boolean;
  saveDebounceMs?: number; // debounce how frequently get updates from onChange; if saveDebounceMs=0 get them on every change.  Default is the global SAVE_DEBOUNCE_MS const.
  onBlur?: () => void;
  onFocus?: () => void;
  minimal?: boolean;
  editBarStyle?: CSSProperties;

  // onCursors is called when user cursor(s) move.  "editable" mode only supports a single
  // cursor right now, but "markdown" mode supports multiple cursors.  An array is
  // output in all cases.  In editable mode, the cursor is positioned where it would be
  // in the plain text.
  onCursors?: (cursors: { x: number; y: number }[]) => void;
  // If cursors are given, then they get rendered in the editor.  This is a map
  // from account_id to objects {x:number,y:number} that give the 0-based row and column
  // in the plain markdown text, as of course output by onCursors above.
  cursors?: ImmutableMap<string, any>;
  noVfill?: boolean;
  editorDivRef?: RefObject<HTMLDivElement>; // if in slate "editor" mode, this is the top-level div
  cmOptions?: { [key: string]: any }; // used for codemirror options override above and account settings
  // It is important to handle all of these, rather than trying to rely
  // on some global keyboard shortcuts.  E.g., in vim mode codemirror,
  // user types ":w" in their editor and whole document should save
  // to disk...
  onUndo?: () => void; // called when user requests to undo
  onRedo?: () => void; // called when user requests redo
  onSave?: () => void; // called when user requests to save document

  compact?: boolean; // optimize for compact embedded usage.

  // onCursorTop and onCursorBottom are called when the cursor is on top line and goes up,
  // so that client could move to another editor (e.g., in Jupyter this is how you move out
  // of a cell to an adjacent cell).
  onCursorTop?: () => void;
  onCursorBottom?: () => void;

  // Declarative control of whether or not the editor is focused.  Only has an imput
  // if it is explicitly set to true or false.
  isFocused?: boolean;

  registerEditor?: (editor: EditorFunctions) => void;
  unregisterEditor?: () => void;

  // refresh codemirror if this changes
  refresh?: any;
}

export default function MultiMarkdownInput({
  cacheId,
  value,
  defaultMode,
  fixedMode,
  onChange,
  getValueRef,
  onModeChange,
  onShiftEnter,
  placeholder,
  fontSize,
  height = "auto",
  style,
  autoFocus,
  enableMentions,
  enableUpload = true,
  onUploadStart,
  onUploadEnd,
  submitMentionsRef,
  extraHelp,
  saveDebounceMs = SAVE_DEBOUNCE_MS,
  hideHelp,
  onBlur,
  onFocus,
  minimal,
  editBarStyle,
  onCursors,
  cursors,
  noVfill,
  editorDivRef,
  cmOptions,
  onUndo,
  onRedo,
  onSave,
  onCursorTop,
  onCursorBottom,
  compact,
  isFocused,
  registerEditor,
  unregisterEditor,
  modeSwitchStyle,
  refresh,
}: Props) {
  const { project_id, path } = useFrameContext();

  function getCache() {
    return cacheId === undefined
      ? undefined
      : multimodeStateCache.get(`${project_id}${path}:${cacheId}`);
  }

  const [mode, setMode0] = useState<Mode>(
    fixedMode ??
      getCache()?.mode ??
      defaultMode ??
      localStorage[LOCAL_STORAGE_KEY] ??
      "editor"
  );

  useEffect(() => {
    onModeChange?.(mode);
  }, []);

  const setMode = (mode: Mode) => {
    localStorage[LOCAL_STORAGE_KEY] = mode;
    setMode0(mode);
    onModeChange?.(mode);
    if (cacheId !== undefined) {
      multimodeStateCache.set(`${project_id}${path}:${cacheId}`, {
        ...getCache(),
        mode,
      });
    }
  };
  const [focused, setFocused] = useState<boolean>(!!autoFocus);
  const ignoreBlur = useRef<boolean>(false);

  const cursorsMap = useMemo(() => {
    return cursors == null ? undefined : fromJS(cursors);
  }, [cursors]);

  const selectionRef = useRef<{
    getSelection: Function;
    setSelection: Function;
  } | null>(null);

  useEffect(() => {
    if (cacheId == null) return;
    const cache = getCache();
    if (cache?.[mode] != null && selectionRef.current != null) {
      // restore selection on mount.
      try {
        selectionRef.current.setSelection(cache?.[mode]);
      } catch (_err) {
        // console.warn(_err);  // definitely don't need this.
        // This is expected to fail, since the selection from last
        // use will be invalid now if another user changed the
        // document, etc., or you did in a different mode, possibly.
      }
    }
    return () => {
      if (selectionRef.current == null || cacheId == null) return;
      const selection = selectionRef.current.getSelection();
      multimodeStateCache.set(`${project_id}${path}:${cacheId}`, {
        ...getCache(),
        [mode]: selection,
      });
    };
  }, [mode]);

  return (
    <div
      style={{
        position: "relative",
        width: "100%",
        height: "100%",
        ...(minimal
          ? undefined
          : {
              overflow: "hidden",
              background: "white",
              color: "black",
              ...(focused ? FOCUSED_STYLE : BLURED_STYLE),
            }),
      }}
    >
      <div
        onMouseDown={() => {
          // Clicking the checkbox blurs the edit field, but
          // this is the one case we do NOT want to trigger the
          // onBlur callback, since that would make switching
          // back and forth between edit modes impossible.
          ignoreBlur.current = true;
          setTimeout(() => (ignoreBlur.current = false), 100);
        }}
        onTouchStart={() => {
          ignoreBlur.current = true;
          setTimeout(() => (ignoreBlur.current = false), 100);
        }}
      >
        {!fixedMode && (
          <div
            style={{
              background: "white",
              color: "#666",
              ...(mode == "editor" || hideHelp
                ? {
                    position: "absolute",
                    right: 0,
                    zIndex: 1,
                  }
                : { float: "right" }),
              ...modeSwitchStyle,
            }}
          >
            <Radio.Group
              options={[
                // fontWeight is needed to undo a stupid conflict with bootstrap css, which will go away when we get rid of that ancient nonsense.
                {
                  label: <span style={{ fontWeight: 400 }}>Text</span>,
                  value: "editor",
                },
                {
                  label: <span style={{ fontWeight: 400 }}>Markdown</span>,
                  value: "markdown",
                },
              ]}
              onChange={(e) => {
                setMode(e.target.value as Mode);
              }}
              value={mode}
              optionType="button"
              size="small"
              buttonStyle="solid"
              style={{ display: "block" }}
            />
          </div>
        )}
      </div>
      {mode == "markdown" && (
        <MarkdownInput
          divRef={editorDivRef}
          selectionRef={selectionRef}
          value={value}
          onChange={onChange}
          saveDebounceMs={saveDebounceMs}
          getValueRef={getValueRef}
          project_id={project_id}
          path={path}
          enableUpload={enableUpload}
          onUploadStart={onUploadStart}
          onUploadEnd={onUploadEnd}
          enableMentions={enableMentions}
          onShiftEnter={onShiftEnter}
          placeholder={placeholder ?? "Type markdown..."}
          fontSize={fontSize}
          cmOptions={cmOptions}
          height={height}
          instructionsStyle={editBarStyle}
          style={style}
          autoFocus={focused}
          submitMentionsRef={submitMentionsRef}
          extraHelp={extraHelp}
          hideHelp={hideHelp}
          onBlur={(value) => {
            onChange?.(value);
            if (!ignoreBlur.current) {
              onBlur?.();
            }
          }}
          onFocus={onFocus}
          onSave={onSave}
          onUndo={onUndo}
          onRedo={onRedo}
          onCursors={onCursors}
          cursors={cursorsMap}
          onCursorTop={onCursorTop}
          onCursorBottom={onCursorBottom}
          isFocused={isFocused}
          registerEditor={registerEditor}
          unregisterEditor={unregisterEditor}
          refresh={refresh}
          compact={compact}
        />
      )}
      {mode == "editor" && (
        <div
          style={{
            height: height ?? "100%",
            width: "100%",
            fontSize: "14px" /* otherwise button bar can be skewed */,
            ...style, // make it possible to override width, height, etc.  This of course allows for problems but is essential. E.g., we override width for chat input in a whiteboard.
          }}
          className={height != "auto" ? "smc-vfill" : undefined}
        >
          <EditableMarkdown
            selectionRef={selectionRef}
            divRef={editorDivRef}
            noVfill={noVfill}
            value={value}
            is_current={true}
            hidePath
            disableWindowing
            style={
              minimal
                ? { background: undefined, backgroundColor: undefined }
                : undefined
            }
            pageStyle={
              minimal
                ? { background: undefined, padding: 0 }
                : { padding: "5px 15px" }
            }
            height={height}
            editBarStyle={
              {
                paddingRight: "127px",
                ...editBarStyle,
              } /* this paddingRight is of course just a stupid temporary hack, since by default the mode switch is on top of it, which matters when cursor in a list or URL */
            }
            saveDebounceMs={saveDebounceMs}
            getValueRef={getValueRef}
            actions={{
              set_value: (value) => {
                onChange?.(value);
              },
              shiftEnter: onShiftEnter,
              altEnter: (value) => {
                onChange?.(value);
                setMode("markdown");
              },
              set_cursor_locs: onCursors,
              undo: onUndo,
              redo: onRedo,
              save: onSave as any,
            }}
            cursors={cursorsMap}
            font_size={fontSize}
            autoFocus={focused}
            onFocus={() => {
              setFocused(true);
              onFocus?.();
            }}
            onBlur={() => {
              setFocused(false);
              if (!ignoreBlur.current) {
                onBlur?.();
              }
            }}
            hideSearch
            onCursorTop={onCursorTop}
            onCursorBottom={onCursorBottom}
            isFocused={isFocused}
            registerEditor={registerEditor}
            unregisterEditor={unregisterEditor}
            placeholder={placeholder ?? "Type text..."}
          />
        </div>
      )}
    </div>
  );
}
