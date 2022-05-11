/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
Markdown editor
*/

// Note -- the old file upload used .chat-images for everything,
// rather than a directory for each file.
const AUX_FILE_EXT = "upload";

import { isEqual } from "lodash";
import { join } from "path";
import * as CodeMirror from "codemirror";
type EventHandlerFunction = (cm: CodeMirror.Editor) => void;
import {
  aux_file,
  len,
  path_split,
  trunc_middle,
  trunc,
} from "@cocalc/util/misc";
import { IS_MOBILE } from "../../feature";
import { A } from "../../components";
import { useTypedRedux, useRedux, redux, ReactDOM } from "../../app-framework";
import {
  CSSProperties,
  MutableRefObject,
  RefObject,
  ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Dropzone, FileUploadWrapper } from "../../file-upload";
import { alert_message } from "../../alerts";
import { Complete, Item } from "./complete";
import { submit_mentions } from "./mentions";
import { mentionableUsers } from "./mentionable-users";
import { debounce } from "lodash";
import { Cursors, CursorsType } from "@cocalc/frontend/jupyter/cursors";

import { EditorFunctions } from "./multimode";

// This code depends on codemirror being initialized.
import "@cocalc/frontend/codemirror/init";

export const BLURED_STYLE: CSSProperties = {
  border: "1px solid rgb(204,204,204)", // focused will be rgb(112, 178, 230);
};

export const FOCUSED_STYLE: CSSProperties = {
  outline: "none !important",
  boxShadow: "0px 0px 5px  #719ECE",
  border: "1px solid #719ECE",
};

const PADDING_TOP = 6;

const MENTION_CSS =
  "color:#7289da; background:rgba(114,137,218,.1); border-radius: 3px; padding: 0 2px;";

interface Props {
  project_id?: string; // must be set if enableUpload or enableMentions is set  (todo: enforce via typescript)
  path?: string; // must be set if enableUpload or enableMentions is set (todo: enforce via typescript)
  value?: string;
  onChange?: (value: string) => void;
  saveDebounceMs?: number; // if given, calls to onChange are debounced by this param
  getValueRef?: MutableRefObject<() => string>;
  enableUpload?: boolean; // if true, enable drag-n-drop and pasted files
  onUploadStart?: () => void;
  onUploadEnd?: () => void;
  enableMentions?: boolean;
  submitMentionsRef?: MutableRefObject<() => string>;
  style?: CSSProperties;
  onShiftEnter?: (value: string) => void; // also ctrl/alt/cmd-enter call this; see https://github.com/sagemathinc/cocalc/issues/1914
  onEscape?: () => void;
  onBlur?: (value: string) => void;
  onFocus?: () => void;
  isFocused?: boolean; // see docs in multimode.tsx
  placeholder?: string;
  height?: string;
  instructionsStyle?: CSSProperties;
  extraHelp?: ReactNode;
  hideHelp?: boolean;
  fontSize?: number;
  styleActiveLine?: boolean;
  lineWrapping?: boolean;
  lineNumbers?: boolean;
  autoFocus?: boolean;
  cmOptions?: { [key: string]: any }; // if given, use this for CodeMirror options, taking precedence over anything derived from other inputs, e.g., lineNumbers, above and account settings.
  selectionRef?: MutableRefObject<{
    setSelection: Function;
    getSelection: Function;
  } | null>;
  onUndo?: () => void; // user requests undo -- if given, codemirror's internal undo is not used
  onRedo?: () => void; // user requests redo
  onSave?: () => void; // user requests save
  onCursors?: (cursors: { x: number; y: number }[]) => void; // cursor location(s).
  cursors?: CursorsType;
  divRef?: RefObject<HTMLDivElement>;
  onCursorTop?: () => void;
  onCursorBottom?: () => void;
  registerEditor?: (editor: EditorFunctions) => void;
  unregisterEditor?: () => void;
  refresh?: any; // refresh codemirror if this changes
  compact?: boolean;
}

export function MarkdownInput({
  project_id,
  path,
  value,
  enableUpload,
  onUploadStart,
  onUploadEnd,
  enableMentions,
  submitMentionsRef,
  style,
  onChange,
  saveDebounceMs,
  getValueRef,
  onShiftEnter,
  onEscape,
  onBlur,
  onFocus,
  placeholder,
  height,
  instructionsStyle,
  extraHelp,
  hideHelp,
  fontSize,
  autoFocus,
  cmOptions,
  selectionRef,
  onUndo,
  onRedo,
  onSave,
  onCursors,
  cursors,
  divRef,
  onCursorTop,
  onCursorBottom,
  isFocused,
  registerEditor,
  unregisterEditor,
  refresh,
  compact,
}: Props) {
  const cm = useRef<CodeMirror.Editor>();
  const textarea_ref = useRef<HTMLTextAreaElement>(null);
  const editor_settings = useRedux(["account", "editor_settings"]);
  const options = useMemo(() => {
    return {
      indentUnit: 2,
      indentWithTabs: false,
      autoCloseBrackets: editor_settings.get("auto_close_brackets", false),
      lineWrapping: editor_settings.get("line_wrapping", true),
      lineNumbers: editor_settings.get("line_numbers", false),
      matchBrackets: editor_settings.get("match_brackets", false),
      styleActiveLine: editor_settings.get("style_active_line", true),
      theme: editor_settings.get("theme", "default"),
      ...cmOptions,
    };
  }, [editor_settings, cmOptions]);

  const defaultFontSize = useTypedRedux("account", "font_size");

  const dropzone_ref = useRef<Dropzone>(null);
  const upload_close_preview_ref = useRef<Function | null>(null);
  const current_uploads_ref = useRef<{ [name: string]: boolean } | null>(null);
  const [isFocusedStyle, setIsFocusedStyle] = useState<boolean>(!!autoFocus);
  const isFocusedRef = useRef<boolean>(!!autoFocus);

  const [mentions, set_mentions] = useState<undefined | Item[]>(undefined);
  const [mentions_offset, set_mentions_offset] = useState<
    undefined | { left: number; top: number }
  >(undefined);
  const [mentions_search, set_mentions_search] = useState<string>("");
  const mentions_cursor_ref = useRef<{
    cursor: EventHandlerFunction;
    change: EventHandlerFunction;
    from: { line: number; ch: number };
  }>();

  const focus = useCallback(() => {
    if (isFocusedRef.current) return; // already focused
    const ed = cm.current;
    if (ed == null) return;
    ed.getInputField().focus({ preventScroll: true });
  }, []);

  const blur = useCallback(() => {
    if (!isFocusedRef.current) return; // already blured
    const ed = cm.current;
    if (ed == null) return;
    ed.getInputField().blur();
  }, []);

  useEffect(() => {
    if (isFocusedRef.current == null || cm.current == null) return;

    if (isFocused && !isFocusedRef.current) {
      focus();
    } else if (!isFocused && isFocusedRef.current) {
      blur();
    }
  }, [isFocused]);

  useEffect(() => {
    cm.current?.refresh();
  }, [refresh]);

  useEffect(() => {
    // initialize the codemirror editor
    const node = ReactDOM.findDOMNode(textarea_ref.current);
    if (node == null) {
      // maybe unmounted right as this happened.
      return;
    }
    const extraKeys: CodeMirror.KeyMap = {};
    if (onShiftEnter != null) {
      const f = (cm) => onShiftEnter(cm.getValue());
      extraKeys["Shift-Enter"] = f;
      extraKeys["Ctrl-Enter"] = f;
      extraKeys["Alt-Enter"] = f;
      extraKeys["Cmd-Enter"] = f;
    }
    if (onEscape != null) {
      extraKeys["Esc"] = () => {
        if (mentions_cursor_ref.current == null) {
          onEscape();
        }
      };
    }
    extraKeys["Enter"] = (cm) => {
      // We only allow enter when mentions isn't in use
      if (mentions_cursor_ref.current == null) {
        cm.execCommand("newlineAndIndent");
      }
    };

    if (onCursorTop != null) {
      extraKeys["Up"] = (cm) => {
        const cur = cm.getCursor();
        if (cur?.line === cm.firstLine() && cur?.ch === 0) {
          onCursorTop();
        } else {
          CodeMirror.commands.goLineUp(cm);
        }
      };
    }
    if (onCursorBottom != null) {
      extraKeys["Down"] = (cm) => {
        const cur = cm.getCursor();
        const n = cm.lastLine();
        const cur_line = cur?.line;
        const cur_ch = cur?.ch;
        const line = cm.getLine(n);
        const line_length = line?.length;
        if (cur_line === n && cur_ch === line_length) {
          onCursorBottom();
        } else {
          CodeMirror.commands.goLineDown(cm);
        }
      };
    }

    cm.current = CodeMirror.fromTextArea(node, {
      ...options,
      inputStyle: "contenteditable" as "contenteditable", // needed for spellcheck to work!
      spellcheck: true,
      extraKeys,
      mode: { name: "gfm" },
    });

    if (getValueRef != null) {
      getValueRef.current = cm.current.getValue.bind(cm.current);
    }
    // UNCOMMENT FOR DEBUGGING ONLY
    // (window as any).cm = cm.current;
    cm.current.setValue(value ?? "");
    cm.current.on("change", saveValue);

    if (onBlur != null) {
      cm.current.on("blur", (editor) => onBlur(editor.getValue()));
    }
    if (onFocus != null) {
      cm.current.on("focus", onFocus);
    }

    cm.current.on("blur", () => {
      isFocusedRef.current = false;
      setIsFocusedStyle(false);
    });
    cm.current.on("focus", () => {
      isFocusedRef.current = true;
      setIsFocusedStyle(true);
      cm.current?.refresh();
    });
    if (onCursors != null) {
      cm.current.on("cursorActivity", () => {
        if (cm.current == null || !isFocusedRef.current) return;
        if (ignoreChangeRef.current) return;
        onCursors(
          cm.current
            .getDoc()
            .listSelections()
            .map((c) => ({ x: c.anchor.ch, y: c.anchor.line }))
        );
      });
    }

    if (onUndo != null) {
      cm.current.undo = () => {
        if (cm.current == null) return;
        saveValue();
        onUndo();
      };
    }
    if (onRedo != null) {
      cm.current.redo = () => {
        if (cm.current == null) return;
        saveValue();
        onRedo();
      };
    }
    if (onSave != null) {
      // This funny cocalc_actions is just how this is setup
      // elsewhere in cocalc... Basically the global
      //    CodeMirror.commands.ave
      // is set to use this.
      // @ts-ignore
      cm.current.cocalc_actions = { explicit_save: onSave };
    }

    if (enableUpload) {
      // as any because the @types for codemirror are WRONG in this case.
      cm.current.on("paste", handle_paste_event as any);
    }

    const e: any = cm.current.getWrapperElement();
    let s = `height:${height}; font-family:sans-serif !important;`;
    if (compact) {
      s += "padding:0";
    } else {
      s += !options.lineNumbers ? `padding:${PADDING_TOP}px 12px` : "";
    }
    e.setAttribute("style", s);

    if (enableMentions) {
      cm.current.on("change", (_cm, changeObj) => {
        if (changeObj.text[0] == "@") {
          show_mentions();
        }
      });
    }

    if (submitMentionsRef != null) {
      submitMentionsRef.current = () => {
        if (project_id == null || path == null) {
          throw Error(
            "project_id and path must be set if enableMentions is set."
          );
        }
        const mentions: { account_id: string; description: string }[] = [];
        if (cm.current == null) return;
        // Get lines here, since we modify the doc as we go below.
        const doc = (cm.current.getDoc() as any).linkedDoc();
        doc.unlinkDoc(cm.current.getDoc());
        const marks = cm.current.getAllMarks();
        marks.reverse();
        for (const mark of marks) {
          if (mark == null) continue;
          const { attributes } = mark as any;
          if (attributes == null) continue; // some other sort of mark?
          const { account_id } = attributes;
          if (account_id == null) continue;
          const loc = mark.find();
          if (loc == null) continue;
          let from, to;
          if (loc["from"]) {
            // @ts-ignore
            ({ from, to } = loc);
          } else {
            from = to = loc;
          }
          const text = `<span class="user-mention" account-id=${account_id} >${cm.current.getRange(
            from,
            to
          )}</span>`;
          const description = trunc(cm.current.getLine(from.line).trim(), 160);
          doc.replaceRange(text, from, to);
          mentions.push({ account_id, description });
        }
        submit_mentions(project_id, path, mentions);
        return doc.getValue();
      };
    }

    if (autoFocus) {
      cm.current.focus();
    }

    if (selectionRef != null) {
      selectionRef.current = {
        setSelection: (selection: any) => {
          cm.current?.setSelections(selection);
        },
        getSelection: () => {
          return cm.current?.listSelections();
        },
      };
    }

    if (registerEditor != null) {
      registerEditor({
        set_cursor: (pos: { x?: number; y?: number }) => {
          if (cm.current == null) return;
          let { x = 0, y = 0 } = pos; // must be defined!
          if (y < 0) {
            // for getting last line...
            y += cm.current.lastLine() + 1;
          }
          cm.current.setCursor({ line: y, ch: x });
        },
      });
    }

    setTimeout(() => {
      cm.current?.refresh();
    }, 0);

    // clean up
    return () => {
      if (cm.current == null) return;
      unregisterEditor?.();
      cm.current.getWrapperElement().remove();
      cm.current = undefined;
    };
  }, []);

  useEffect(() => {
    const bindings = editor_settings.get("bindings");
    if (bindings == null || bindings == "standard") {
      cm.current?.setOption("keyMap", "default");
    } else {
      cm.current?.setOption("keyMap", bindings);
    }
  }, [editor_settings.get("bindings")]);

  useEffect(() => {
    if (cm.current == null) return;
    for (const key in options) {
      const opt = options[key];
      if (!isEqual(cm.current.options[key], opt)) {
        if (opt != null) {
          cm.current.setOption(key as any, opt);
        }
      }
    }
  }, [options]);

  const ignoreChangeRef = useRef<boolean>(false);
  // use valueRef since we can't just refer to value in saveValue
  // below, due to not wanted to regenerate the saveValue function
  // every time, due to debouncing, etc.
  const valueRef = useRef<string | undefined>(value);
  valueRef.current = value;
  const saveValue = useMemo(() => {
    // save value to owner via onChange
    if (onChange == null) return () => {}; // no op
    const f = () => {
      if (cm.current == null) return;
      if (ignoreChangeRef.current) return;
      if (current_uploads_ref.current != null) {
        // IMPORTANT: we do NOT report the latest version back while
        // uploading files.  Otherwise, if more than one is being
        // uploaded at once, then we end up with an infinite loop
        // of updates.  In any case, once all the uploads finish
        // we'll start reporting changes again.  This is fine
        // since you don't want to submit input *during* uploads anyways.
        return;
      }
      const newValue = cm.current.getValue();
      if (valueRef.current !== newValue) {
        onChange(newValue);
      }
    };
    if (saveDebounceMs) {
      return debounce(f, saveDebounceMs);
    } else {
      return f;
    }
  }, []);

  const setValueNoJump = useCallback((newValue: string | undefined) => {
    if (
      newValue == null ||
      cm.current == null ||
      cm.current.getValue() === newValue
    ) {
      return;
    }
    ignoreChangeRef.current = true;
    cm.current.setValueNoJump(newValue);
    ignoreChangeRef.current = false;
  }, []);

  useEffect(() => {
    setValueNoJump(value);
    if (upload_close_preview_ref.current != null) {
      upload_close_preview_ref.current(true);
    }
  }, [value]);

  function upload_sending(file: { name: string }): void {
    if (project_id == null || path == null) {
      throw Error("path must be set if enableUploads is set.");
    }

    // console.log("upload_sending", file);
    if (current_uploads_ref.current == null) {
      current_uploads_ref.current = { [file.name]: true };
      if (onUploadStart != null) {
        onUploadStart();
      }
    } else {
      current_uploads_ref.current[file.name] = true;
    }
    if (cm.current == null) return;
    const input = cm.current.getValue();
    const s = upload_temp_link(path, file);
    if (input.indexOf(s) != -1) {
      // already have link.
      return;
    }
    cm.current.replaceRange(s, cm.current.getCursor());
    saveValue();
  }

  function upload_complete(file: {
    type: string;
    name: string;
    status: string;
  }): void {
    if (path == null) {
      throw Error("path must be set if enableUploads is set.");
    }

    if (current_uploads_ref.current != null) {
      delete current_uploads_ref.current[file.name];
      if (len(current_uploads_ref.current) == 0) {
        current_uploads_ref.current = null;
        if (onUploadEnd != null) {
          onUploadEnd();
        }
      }
    }
    if (cm.current == null) return;
    const input = cm.current.getValue();
    const s0 = upload_temp_link(path, file);
    let s1: string;
    if (file.status == "error") {
      s1 = "";
      alert_message({ type: "error", message: "Error uploading file." });
    } else if (file.status == "canceled") {
      // users can cancel files when they are being uploaded.
      s1 = "";
    } else {
      s1 = upload_link(path, file);
    }
    const newValue = input.replace(s0, s1);
    setValueNoJump(newValue);
    saveValue();
  }

  function upload_removed(file: { name: string; type: string }): void {
    if (cm.current == null) return;
    if (project_id == null || path == null) {
      throw Error("project_id and path must be set if enableUploads is set.");
    }
    if (!current_uploads_ref.current?.[file.name]) {
      // it actually succeeded if this is not set -- it was removed
      // via upload_complete above.
      return;
    }
    delete current_uploads_ref.current[file.name];
    if (onUploadEnd != null) {
      onUploadEnd();
    }

    const input = cm.current.getValue();
    const s = upload_link(path, file);
    if (input.indexOf(s) == -1) {
      // not there anymore; maybe user already submitted -- do nothing further.
      return;
    }
    const newValue = input.replace(s, "");
    setValueNoJump(newValue);
    saveValue();
    // delete from project itself
    const target = join(aux_file(path, AUX_FILE_EXT), file.name);
    // console.log("deleting target", target, { paths: [target] });
    redux.getProjectActions(project_id).delete_files({ paths: [target] });
  }

  function handle_paste_event(_, e): void {
    // console.log("handle_paste_event", e);
    const items = e.clipboardData.items;
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item != null && item.type.startsWith("image/")) {
        e.preventDefault();
        const file = item.getAsFile();
        if (file != null) {
          const blob = file.slice(0, -1, item.type);
          dropzone_ref.current?.addFile(
            new File([blob], `paste-${Math.random()}`, { type: item.type })
          );
        }
        return;
      }
    }
  }

  function render_mention_email(): JSX.Element | undefined {
    if (project_id == null) {
      throw Error("project_id and path must be set if enableMentions is set.");
    }
    if (!redux.getStore("projects").has_internet_access(project_id)) {
      return <span> (enable the Internet Access upgrade to send emails)</span>;
    }
  }

  function render_mobile_instructions() {
    if (hideHelp) {
      return <div style={{ height: "24px", ...instructionsStyle }}></div>;
    }
    return (
      <div
        style={{
          color: "#767676",
          fontSize: "12px",
          padding: "2.5px 15px",
          background: "white",
          ...instructionsStyle,
        }}
      >
        {render_mention_instructions()}
        {render_mention_email()}. Use{" "}
        <A href="https://help.github.com/articles/getting-started-with-writing-and-formatting-on-github/">
          Markdown
        </A>{" "}
        and <A href="https://en.wikibooks.org/wiki/LaTeX/Mathematics">LaTeX</A>.{" "}
        {render_upload_instructions()}
        {extraHelp}
      </div>
    );
  }

  function render_desktop_instructions() {
    if (hideHelp)
      return <div style={{ height: "24px", ...instructionsStyle }}></div>;
    return (
      <div
        style={{
          color: "#767676",
          fontSize: "12px",
          padding: "2.5px 15px",
          background: "white",
          ...instructionsStyle,
        }}
      >
        <A href="https://help.github.com/articles/getting-started-with-writing-and-formatting-on-github/">
          Markdown
        </A>
        {" and "}
        <A href="https://en.wikibooks.org/wiki/LaTeX/Mathematics">
          LaTeX formulas
        </A>
        . {render_mention_instructions()}
        {render_upload_instructions()}
        {extraHelp}
      </div>
    );
    // I removed the emoticons list; it should really be a dropdown that
    // appears like with github... Emoticons: {emoticons}.
  }

  function render_mention_instructions(): JSX.Element | undefined {
    if (!enableMentions) return;
    return (
      <>
        {" "}
        Use @name to mention people
        {render_mention_email()}.{" "}
      </>
    );
  }

  function render_upload_instructions(): JSX.Element | undefined {
    if (!enableUpload) return;
    const text = IS_MOBILE ? (
      <a>Tap here to upload images.</a>
    ) : (
      <>
        Attach images by drag & drop, <a>select</a> or paste.
      </>
    );
    return (
      <>
        {" "}
        <span
          style={{ cursor: "pointer" }}
          onClick={() => {
            // I could not get the clickable config to work,
            // but reading the source code I found that this does:
            dropzone_ref.current?.hiddenFileInput?.click();
          }}
        >
          {text}
        </span>{" "}
      </>
    );
  }

  function render_instructions() {
    return IS_MOBILE
      ? render_mobile_instructions()
      : render_desktop_instructions();
  }

  // Show the mentions popup selector.   We *do* allow mentioning ourself,
  // since Discord and Github both do, and maybe it's just one of those
  // "symmetry" things (like liking your own post) that people feel is right.
  function show_mentions() {
    if (cm.current == null) return;
    if (project_id == null) {
      throw Error("project_id and path must be set if enableMentions is set.");
    }
    const v = mentionableUsers(project_id);
    if (v.length == 0) {
      // nobody to mention (e.g., admin doesn't have this)
      return;
    }
    set_mentions(v);
    set_mentions_search("");

    const cursor = cm.current.getCursor();
    const pos = cm.current.cursorCoords(cursor, "local");
    const scrollOffset = cm.current.getScrollInfo().top;
    const top = pos.bottom - scrollOffset + PADDING_TOP;
    // gutter is empty right now, but let's include this in case
    // we implement line number support...
    const gutter = $(cm.current.getGutterElement()).width() ?? 0;
    const left = pos.left + gutter;
    set_mentions_offset({ left, top });

    let last_cursor = cursor;
    mentions_cursor_ref.current = {
      from: { line: cursor.line, ch: cursor.ch - 1 },
      cursor: (cm) => {
        const pos = cm.getCursor();
        // The hitSide and sticky attributes of pos below
        // are set when you manually move the cursor, rather than
        // it moving due to typing.  We check them to avoid
        // confusion such as
        //     https://github.com/sagemathinc/cocalc/issues/4833
        // and in that case move the cursor back.
        if (
          pos.line != last_cursor.line ||
          (pos as { hitSide?: boolean }).hitSide ||
          (pos as { sticky?: string }).sticky != null
        ) {
          cm.setCursor(last_cursor);
        } else {
          last_cursor = pos;
        }
      },
      change: (cm) => {
        const pos = cm.getCursor();
        const search = cm.getRange(cursor, pos);
        set_mentions_search(search.trim().toLowerCase());
      },
    };
    cm.current.on("cursorActivity", mentions_cursor_ref.current.cursor);
    cm.current.on("change", mentions_cursor_ref.current.change);
  }

  function close_mentions() {
    set_mentions(undefined);
    if (cm.current != null) {
      if (mentions_cursor_ref.current != null) {
        cm.current.off("cursorActivity", mentions_cursor_ref.current.cursor);
        cm.current.off("change", mentions_cursor_ref.current.change);
        mentions_cursor_ref.current = undefined;
      }
      cm.current.focus();
    }
  }

  function render_mentions_popup() {
    if (mentions == null || mentions_offset == null) return;

    const items: Item[] = [];
    for (const item of mentions) {
      if (item.search?.indexOf(mentions_search) != -1) {
        items.push(item);
      }
    }
    if (items.length == 0) {
      if (mentions.length == 0) {
        // See https://github.com/sagemathinc/cocalc/issues/4909
        close_mentions();
        return;
      }
      items.push(mentions[0]); // ensure at least one
    }

    return (
      <Complete
        items={items}
        onCancel={close_mentions}
        onSelect={(account_id) => {
          if (mentions_cursor_ref.current == null) return;
          const text =
            "@" +
            trunc_middle(redux.getStore("users").get_name(account_id), 64);
          if (cm.current == null) return;
          const from = mentions_cursor_ref.current.from;
          const to = cm.current.getCursor();
          cm.current.replaceRange(text + " ", from, to);
          cm.current.markText(
            from,
            { line: from.line, ch: from.ch + text.length },
            {
              atomic: true,
              css: MENTION_CSS,
              attributes: { account_id },
            } as CodeMirror.TextMarkerOptions /* @types are out of date */
          );
          close_mentions(); // must be after use of mentions_cursor_ref above.
          cm.current.focus();
        }}
        offset={mentions_offset}
      />
    );
  }

  let body: JSX.Element = (
    <div>
      {value != "" ? render_instructions() : undefined}
      <div
        ref={divRef}
        style={{
          ...(isFocusedStyle ? FOCUSED_STYLE : BLURED_STYLE),
          ...style,
          ...{
            fontSize: `${fontSize ? fontSize : defaultFontSize}px`,
            height,
          },
        }}
      >
        {render_mentions_popup()}
        {cursors != null && cm.current != null && (
          <Cursors cursors={cursors} codemirror={cm.current} />
        )}
        <textarea
          style={{ display: "none" }}
          ref={textarea_ref}
          placeholder={placeholder}
        />
      </div>
    </div>
  );
  if (enableUpload) {
    const event_handlers = {
      complete: upload_complete,
      sending: upload_sending,
      removedfile: upload_removed,
    };
    if (project_id == null || path == null) {
      throw Error("project_id and path must be set if enableUploads is set.");
    }
    body = (
      <FileUploadWrapper
        project_id={project_id}
        dest_path={aux_file(path, AUX_FILE_EXT)}
        event_handlers={event_handlers}
        style={{ height: "100%", width: "100%" }}
        dropzone_ref={dropzone_ref}
        close_preview_ref={upload_close_preview_ref}
      >
        {body}
      </FileUploadWrapper>
    );
  }

  return body;
}

function upload_target(path: string, file: { name: string }): string {
  // path to our upload target, but relative to path.
  return join(path_split(aux_file(path, AUX_FILE_EXT)).tail, file.name);
}

function upload_temp_link(path: string, file: { name: string }): string {
  return `[Uploading...]\(${upload_target(path, file)}\)`;
}

function upload_link(
  path: string,
  file: { name: string; type: string }
): string {
  const target = upload_target(path, file);
  if (file.type.indexOf("image") !== -1) {
    return `<img src=\"${target}\" style="max-width:100%" />`;
  } else {
    // We use an a tag instead of [${file.name}](${target}) because for
    // some files (e.g,. word doc files) our markdown renderer inexplicably
    // does NOT render them as links!?  a tags work though.
    return `<a href=\"${target}\">${file.name}</a>`;
  }
}
