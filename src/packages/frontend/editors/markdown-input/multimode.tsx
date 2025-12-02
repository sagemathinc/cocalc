/*
Edit with either plain text input **or** WYSIWYG slate-based input.
*/

import { Popover, Radio } from "antd";
import { Map as ImmutableMap, fromJS } from "immutable";
import LRU from "lru-cache";
import {
  CSSProperties,
  MutableRefObject,
  ReactNode,
  RefObject,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { SubmitMentionsRef } from "@cocalc/frontend/chat/types";
import { Icon } from "@cocalc/frontend/components";
import { EditableMarkdown } from "@cocalc/frontend/editors/slate/editable-markdown";
import "@cocalc/frontend/editors/slate/elements/math/math-widget";
import { IS_MOBILE } from "@cocalc/frontend/feature";
import { SAVE_DEBOUNCE_MS } from "@cocalc/frontend/frame-editors/code-editor/const";
import { useFrameContext } from "@cocalc/frontend/frame-editors/frame-tree/frame-context";
import { get_local_storage, set_local_storage } from "@cocalc/frontend/misc";
import { COLORS } from "@cocalc/util/theme";
import { BLURED_STYLE, FOCUSED_STYLE, MarkdownInput } from "./component";

// NOTE: on mobile there is very little suppport for "editor" = "slate", but
// very good support for "markdown", hence the default below.

export interface EditorFunctions {
  set_cursor: (pos: { x?: number; y?: number }) => void;
  get_cursor: () => { x: number; y: number };
}

interface MultimodeState {
  mode?: Mode;
  markdown?: any;
  editor?: any;
}

const multimodeStateCache = new LRU<string, MultimodeState>({ max: 500 });

const MIN_INPUT_HEIGHT = IS_MOBILE ? 44 : 38;
const MAX_INPUT_HEIGHT = "50vh";

// markdown uses codemirror
// editor uses slate.  TODO: this should be "text", not "editor".  Oops.
// UI equivalent:
// editor = "Text" = Slate/wysiwyg
// markdown = "Markdown"
const Modes = ["markdown", "editor"] as const;
export type Mode = (typeof Modes)[number];

const LOCAL_STORAGE_KEY = "markdown-editor-mode";

function getLocalStorageMode(): Mode | undefined {
  const m = get_local_storage(LOCAL_STORAGE_KEY);
  if (typeof m === "string" && Modes.includes(m as any)) {
    return m as Mode;
  }
}

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
  autoGrow?: boolean; // enable dynamic growth (defaults off unless height === "auto")
  style?: CSSProperties;
  modeSwitchStyle?: CSSProperties;
  autoFocus?: boolean; // note - this is broken on safari for the slate editor, but works on chrome and firefox.
  enableMentions?: boolean;
  enableUpload?: boolean; // whether to enable upload of files via drag-n-drop or paste.  This is on by default! (Note: not possible to disable for slate editor mode anyways.)
  onUploadStart?: () => void;
  onUploadEnd?: () => void;
  submitMentionsRef?: SubmitMentionsRef;
  extraHelp?: ReactNode;
  hideHelp?: boolean;
  hideModeSwitch?: boolean;
  // debounce how frequently get updates from onChange; if saveDebounceMs=0 get them on every change.  Default is the global SAVE_DEBOUNCE_MS const.
  // can be a little more frequent in case of shift or alt enter, or blur.
  saveDebounceMs?: number;
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

  // Declarative control of whether or not the editor is focused.  Only has an impact
  // if it is explicitly set to true or false.
  isFocused?: boolean;

  registerEditor?: (editor: EditorFunctions) => void;
  unregisterEditor?: () => void;

  // refresh codemirror if this changes
  refresh?: any;

  overflowEllipsis?: boolean; // if true (the default!), show "..." button popping up all menu entries

  dirtyRef?: MutableRefObject<boolean>; // a boolean react ref that gets set to true whenever document changes for any reason (client should explicitly set this back to false).

  controlRef?: MutableRefObject<any>;
}

export default function MultiMarkdownInput({
  autoFocus,
  cacheId,
  cmOptions,
  compact,
  cursors,
  defaultMode,
  dirtyRef,
  editBarStyle,
  editorDivRef,
  enableMentions,
  enableUpload = true,
  extraHelp,
  fixedMode,
  fontSize,
  getValueRef,
  height = "auto",
  autoGrow,
  hideHelp,
  hideModeSwitch,
  isFocused,
  minimal,
  modeSwitchStyle,
  noVfill,
  onBlur,
  onChange,
  onCursorBottom,
  onCursors,
  onCursorTop,
  onFocus,
  onModeChange,
  onRedo,
  onSave,
  onShiftEnter,
  onUndo,
  onUploadEnd,
  onUploadStart,
  overflowEllipsis = true,
  placeholder,
  refresh,
  registerEditor,
  saveDebounceMs = SAVE_DEBOUNCE_MS,
  style,
  submitMentionsRef,
  unregisterEditor,
  value,
  controlRef,
}: Props) {
  const {
    isFocused: isFocusedFrame,
    isVisible,
    project_id,
    path,
  } = useFrameContext();

  // We use refs for shiftEnter and onChange to be absolutely
  // 100% certain that if either of these functions is changed,
  // then the new function is used, even if the components
  // implementing our markdown editor mess up somehow and hang on.
  const onShiftEnterRef = useRef<any>(onShiftEnter);
  useEffect(() => {
    onShiftEnterRef.current = onShiftEnter;
  }, [onShiftEnter]);
  const onChangeRef = useRef<any>(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  const editBar2 = useRef<React.JSX.Element | undefined>(undefined);

  const isAutoGrow = autoGrow ?? height === "auto";

  const getKey = () => `${project_id}${path}:${cacheId}`;

  function getCache() {
    return cacheId == null ? undefined : multimodeStateCache.get(getKey());
  }

  const [mode, setMode0] = useState<Mode>(
    fixedMode ??
      getCache()?.mode ??
      defaultMode ??
      getLocalStorageMode() ??
      (IS_MOBILE ? "markdown" : "editor"),
  );

  const [editBarPopover, setEditBarPopover] = useState<boolean>(false);

  useEffect(() => {
    onModeChange?.(mode);
  }, []);

  const setMode = (mode: Mode) => {
    set_local_storage(LOCAL_STORAGE_KEY, mode);
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
    if (cacheId == null) {
      return;
    }
    const cache = getCache();
    if (cache?.[mode] != null && selectionRef.current != null) {
      // restore selection on mount.
      try {
        selectionRef.current.setSelection(cache?.[mode]);
      } catch (_err) {
        // it might just be that the document isn't initialized yet
        setTimeout(() => {
          try {
            selectionRef.current?.setSelection(cache?.[mode]);
          } catch (_err2) {
            //  console.warn(_err2); // definitely don't need this.
            // This is expected to fail, since the selection from last
            // use will be invalid now if another user changed the
            // document, etc., or you did in a different mode, possibly.
          }
        }, 100);
      }
    }
    return () => {
      if (selectionRef.current == null || cacheId == null) {
        return;
      }
      const selection = selectionRef.current.getSelection();
      multimodeStateCache.set(getKey(), {
        ...getCache(),
        [mode]: selection,
      });
    };
  }, [mode]);

  function toggleEditBarPopover() {
    setEditBarPopover(!editBarPopover);
  }

  function renderEditBarEllipsis() {
    return (
      <span style={{ fontWeight: 400 }}>
        {"\u22EF"}
        <Popover
          open={isFocusedFrame && isVisible && editBarPopover}
          content={
            <div style={{ display: "flex" }}>
              {editBar2.current}
              <Icon
                onClick={() => setEditBarPopover(false)}
                name="times"
                style={{
                  color: COLORS.GRAY_M,
                  marginTop: "5px",
                }}
              />
            </div>
          }
        />
      </span>
    );
  }

  const showModeSwitch = !fixedMode && !hideModeSwitch;

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
        {showModeSwitch && (
          <div
            style={{
              background: "white",
              color: COLORS.GRAY_M,
              ...(mode == "editor" || hideHelp
                ? {
                    float: "right",
                    position: "relative",
                    zIndex: 1,
                  }
                : { float: "right" }),
              ...modeSwitchStyle,
            }}
          >
            <Radio.Group
              options={[
                ...(overflowEllipsis && mode == "editor"
                  ? [
                      {
                        label: renderEditBarEllipsis(),
                        value: "menu",
                        style: {
                          backgroundColor: editBarPopover
                            ? COLORS.GRAY_L
                            : "white",
                          paddingLeft: 10,
                          paddingRight: 10,
                        },
                      },
                    ]
                  : []),
                // fontWeight is needed to undo a stupid conflict with bootstrap css, which will go away when we get rid of that ancient nonsense.
                {
                  label: <span style={{ fontWeight: 400 }}>Rich Text</span>,
                  value: "editor",
                },
                {
                  label: <span style={{ fontWeight: 400 }}>Markdown</span>,
                  value: "markdown",
                },
              ]}
              onChange={(e) => {
                const mode = e.target.value;
                if (mode === "menu") {
                  toggleEditBarPopover();
                } else {
                  setMode(mode as Mode);
                }
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
      {mode === "markdown" ? (
        <MarkdownInput
          divRef={editorDivRef}
          selectionRef={selectionRef}
          value={value}
          onChange={(value) => {
            onChangeRef.current?.(value);
          }}
          saveDebounceMs={saveDebounceMs}
          getValueRef={getValueRef}
          project_id={project_id}
          path={path}
          enableUpload={enableUpload}
          onUploadStart={onUploadStart}
          onUploadEnd={onUploadEnd}
          enableMentions={enableMentions}
          onShiftEnter={(value) => {
            onShiftEnterRef.current?.(value);
          }}
          placeholder={placeholder ?? "Type markdown..."}
          fontSize={fontSize}
          cmOptions={cmOptions}
          height={height}
          autoGrow={autoGrow ?? height === "auto"}
          style={style}
          autoFocus={focused}
          submitMentionsRef={submitMentionsRef}
          extraHelp={extraHelp}
          hideHelp={hideHelp}
          onBlur={(value) => {
            onChangeRef.current?.(value);
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
          dirtyRef={dirtyRef}
        />
      ) : undefined}
      {mode === "editor" ? (
        <div
          style={{
            height: isAutoGrow ? undefined : height,
            minHeight: `${MIN_INPUT_HEIGHT}px`,
            maxHeight: isAutoGrow ? MAX_INPUT_HEIGHT : height,
            overflowY: "auto",
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
            disableWindowing={
              true /* I tried making this false when height != 'auto', but then *clicking to set selection* doesn't work at least for task list.*/
            }
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
            minimal={minimal}
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
                onChangeRef.current?.(value);
              },
              shiftEnter: (value) => {
                onChangeRef.current?.(value);
                onShiftEnterRef.current?.(value);
              },
              altEnter: (value) => {
                onChangeRef.current?.(value);
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
            submitMentionsRef={submitMentionsRef}
            editBar2={editBar2}
            dirtyRef={dirtyRef}
            controlRef={controlRef}
          />
        </div>
      ) : undefined}
    </div>
  );
}
