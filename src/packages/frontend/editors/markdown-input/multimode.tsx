/*
Edit with either plain text input **or** WYSIWYG slate-based input.
*/

import { useEffect } from "react";
import { Popover } from "antd";
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
import { Icon } from "@cocalc/frontend/components/icon";
import { fromJS, Map as ImmutableMap } from "immutable";
import LRU from "lru-cache";

interface MultimodeState {
  mode?: Mode;
  markdown?: any;
  editor?: any;
}

const multimodeStateCache = new LRU<string, MultimodeState>({ max: 500 });

// markdown uses codemirror
// editor uses slate.
export type Mode = "markdown" | "editor";

const LOCAL_STORAGE_KEY = "markdown-editor-mode";

interface Props {
  cacheId?: string; // unique **within this file**; the project_id and path are automatically also used
  value?: string;
  defaultMode?: Mode; // defaults to editor or whatever was last used (as stored in localStorage)
  onChange: (value: string) => void;
  onShiftEnter?: (value: string) => void;
  placeholder?: string;
  fontSize?: number;
  height?: string;
  style?: CSSProperties;
  autoFocus?: boolean; // note - this is broken on safari for the slate editor, but works on chrome and firefox.
  enableMentions?: boolean;
  enableUpload?: boolean;
  onUploadStart?: () => void;
  onUploadEnd?: () => void;
  submitMentionsRef?: any;
  extraHelp?: ReactNode;
  hideHelp?: boolean;
  lineWrapping?: boolean; // only for source codemirror text mode
  lineNumbers?: boolean; // only for source codemirror text mode
  saveDebounceMs?: number;
  onBlur?: () => void;
  onFocus?: () => void;
  minimal?: boolean;
  editBarStyle?: CSSProperties;
  markdownToggleStyle?: CSSProperties;

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
  cmOptions?: { [key: string]: any }; // used for codemirror options instead of anything above, e.g,. lineNumbers

  // It is important to handle all of these, rather than trying to rely
  // on some global keyboard shortcuts.  E.g., in vim mode codemirror,
  // user types ":w" in their editor and whole document should save
  // to disk...
  onUndo?: () => void; // called when user requests to undo
  onRedo?: () => void; // called when user requests redo
  onSave?: () => void; // called when user requests to save document
}

export default function MultiMarkdownInput({
  cacheId,
  value,
  defaultMode,
  onChange,
  onShiftEnter,
  placeholder,
  fontSize,
  height,
  style,
  autoFocus,
  enableMentions,
  enableUpload,
  onUploadStart,
  onUploadEnd,
  submitMentionsRef,
  extraHelp,
  lineWrapping,
  lineNumbers,
  saveDebounceMs = 0,
  hideHelp,
  onBlur,
  onFocus,
  minimal,
  editBarStyle,
  markdownToggleStyle,
  onCursors,
  cursors,
  noVfill,
  editorDivRef,
  cmOptions,

  onUndo,
  onRedo,
  onSave,
}: Props) {
  const { project_id, path } = useFrameContext();

  function getCache() {
    return cacheId === undefined
      ? undefined
      : multimodeStateCache.get(`${project_id}${path}:${cacheId}`);
  }

  const [mode, setMode0] = useState<Mode>(
    getCache()?.mode ??
      defaultMode ??
      localStorage[LOCAL_STORAGE_KEY] ??
      "editor"
  );

  const setMode = (mode: Mode) => {
    localStorage[LOCAL_STORAGE_KEY] = mode;
    setMode0(mode);
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
      selectionRef.current.setSelection(cache?.[mode]);
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
        <div
          style={{
            fontSize: "14px",
            position: "absolute",
            right: 1,
            top: 1,
            zIndex: 100,
            padding: "0px 3px",
            boxShadow: "#ccc 1px 3px 5px",
            fontWeight: 250,
            background: "white",
            ...markdownToggleStyle,
            cursor: "pointer",
            color: mode == "markdown" ? "blue" : "black",
          }}
          onClick={() => {
            setMode(mode == "editor" ? "markdown" : "editor");
          }}
        >
          <Popover
            title="Markdown"
            content={
              mode == "editor"
                ? "This is editable text with support for LaTeX.  Toggle to edit markdown source."
                : "Edit markdown here with support for LaTeX. Toggle to edit text directly."
            }
          >
            <Icon name="markdown" />
          </Popover>
        </div>
      </div>
      {mode == "markdown" && (
        <MarkdownInput
          selectionRef={selectionRef}
          value={value}
          onChange={onChange}
          project_id={project_id}
          path={path}
          enableUpload={enableUpload}
          onUploadStart={onUploadStart}
          onUploadEnd={onUploadEnd}
          enableMentions={enableMentions}
          onShiftEnter={onShiftEnter}
          placeholder={placeholder}
          fontSize={fontSize}
          lineWrapping={lineWrapping}
          lineNumbers={lineNumbers}
          cmOptions={cmOptions}
          height={height}
          style={style}
          autoFocus={focused}
          submitMentionsRef={submitMentionsRef}
          extraHelp={extraHelp}
          hideHelp={hideHelp}
          onBlur={
            onBlur != null
              ? (value) => {
                  onChange(value);
                  if (!ignoreBlur.current) {
                    onBlur();
                  }
                }
              : undefined
          }
          onFocus={onFocus}
          onSave={onSave}
          onUndo={onUndo}
          onRedo={onRedo}
        />
      )}
      {mode == "editor" && (
        <div
          style={{
            ...style,
            height: height ?? "100%",
            width: "100%",
            fontSize: "14px" /* otherwise button bar can be skewed */,
          }}
          className="smc-vfill"
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
                : {
                    padding: "5px 15px",
                    height: height ?? "100%",
                  }
            }
            editBarStyle={editBarStyle}
            saveDebounceMs={saveDebounceMs}
            actions={{
              set_value: (value) => {
                onChange?.(value);
              },
              shiftEnter: onShiftEnter,
              altEnter: (value) => {
                onChange?.(value);
                setMode("markdown");
              },
              set_cursor_locs: onCursors != null ? onCursors : undefined,
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
          />
        </div>
      )}
    </div>
  );
}
