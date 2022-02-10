/*
Edit with either plain text input **or** WYSIWYG slate-based input.

Work in progress!s
*/

import { Checkbox } from "antd";
import "@cocalc/frontend/editors/slate/elements/math/math-widget";
import { EditableMarkdown } from "@cocalc/frontend/editors/slate/editable-markdown";
import { MarkdownInput } from "./component";
import { CSSProperties, ReactNode, useState } from "react";
import { useFrameContext } from "@cocalc/frontend/frame-editors/frame-tree/frame-context";
import { FOCUSED_STYLE, BLURED_STYLE } from "./component";

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
  lineWrapping?: boolean;
  saveDebounceMs?: number;
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
  return (
    <div
      style={{
        background: "white",
        color: "black",
        position: "relative",
        width: "100%",
        ...(focused ? FOCUSED_STYLE : BLURED_STYLE),
      }}
    >
      <Checkbox
        style={{
          ...(mode == "editor" || !value
            ? { position: "absolute", right: 1, top: 1, zIndex: 100 }
            : { float: "right" }),
          fontWeight: 250,
          background: "white",
        }}
        checked={mode == "markdown"}
        onClick={(e: any) => setMode(e.target.checked ? "markdown" : "editor")}
      >
        Markdown
      </Checkbox>
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
        />
      )}
      {mode == "editor" && (
        <div
          style={{
            ...style,
            height: height ?? "100%",
            width: "100%",
          }}
          className="smc-vfill"
        >
          <EditableMarkdown
            value={value}
            is_current={true}
            hidePath
            disableWindowing
            pageStyle={{
              padding: "5px 15px",
              height: height ?? "100%",
            }}
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
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            hideSearch
          />
        </div>
      )}
    </div>
  );
}
