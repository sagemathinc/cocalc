/*
Edit with either plain text input **or** WYSIWYG slate-based input.

Work in progress!
*/

import { Popover } from "antd";
import "@cocalc/frontend/editors/slate/elements/math/math-widget";
import { EditableMarkdown } from "@cocalc/frontend/editors/slate/editable-markdown";
import { MarkdownInput } from "./component";
import { CSSProperties, ReactNode, useRef, useState } from "react";
import { useFrameContext } from "@cocalc/frontend/frame-editors/frame-tree/frame-context";
import { FOCUSED_STYLE, BLURED_STYLE } from "./component";
import { Icon } from "@cocalc/frontend/components/icon";

export type Mode = "markdown" | "editor";

const LOCAL_STORAGE_KEY = "markdown-editor-mode";

interface Props {
  value?: string;
  defaultMode?: Mode; // defaults to editor or whatever was last used (as stored in localStorage)
  onChange?: (value: string) => void;
  onShiftEnter?: () => void;
  placeholder?: string;
  fontSize?: number;
  height?: string;
  style?: CSSProperties;
  autoFocus?: boolean;
  enableMentions?: boolean;
  enableUpload?: boolean;
  onUploadStart?: () => void;
  onUploadEnd?: () => void;
  submitMentionsRef?: any;
  extraHelp?: ReactNode;
  hideHelp?: boolean;
  lineWrapping?: boolean;
  saveDebounceMs?: number;
  onBlur?: () => void;
  onFocus?: () => void;
  minimal?: boolean;
  editBarStyle?: CSSProperties;
  markdownToggleStyle?: CSSProperties;
}

export default function MultiMarkdownInput({
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
  saveDebounceMs,
  hideHelp,
  onBlur,
  onFocus,
  minimal,
  editBarStyle,
  markdownToggleStyle,
}: Props) {
  const { project_id, path } = useFrameContext();
  const [mode, setMode0] = useState<Mode>(
    defaultMode ?? localStorage[LOCAL_STORAGE_KEY] ?? "editor"
  );
  const setMode = (mode: Mode) => {
    localStorage[LOCAL_STORAGE_KEY] = mode;
    setMode0(mode);
  };
  const [focused, setFocused] = useState<boolean>(!!autoFocus);
  const ignoreBlur = useRef<boolean>(false);

  return (
    <div
      style={{
        position: "relative",
        width: "100%",
        height: "100%",
        ...(minimal
          ? undefined
          : {
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
          height={height}
          style={style}
          autoFocus={autoFocus}
          submitMentionsRef={submitMentionsRef}
          extraHelp={extraHelp}
          hideHelp={hideHelp}
          onBlur={
            onBlur != null
              ? () => {
                  if (!ignoreBlur.current) {
                    onBlur();
                  }
                }
              : undefined
          }
          onFocus={onFocus}
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
            saveDebounceMs={saveDebounceMs ?? 0}
            actions={{
              set_value: (value) => {
                onChange?.(value);
              },
              shiftEnter:
                onShiftEnter == null
                  ? undefined
                  : (value) => {
                      onChange?.(value);
                      onShiftEnter();
                    },
              altEnter: (value) => {
                onChange?.(value);
                setMode("markdown");
              },
            }}
            font_size={fontSize}
            autoFocus={autoFocus}
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
