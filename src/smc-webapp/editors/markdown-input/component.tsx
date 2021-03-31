/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
Markdown editor

Stage 1 -- enough to replace current chat input:
  - [x] @mentions (via completion dialog) -the collabs on this project
     - [ ] type to search/restrict from list of collabs
     - [x] get rid of the "enable_mentions" account pref flag and data -- always have it
     - [x] write new better more generic completions widget support
     - [x] insert mention code in editor on select
     - [x]  use on submit.
  - [x] main input at bottom feels SLOW (even though editing messages is fast)
  - [x] different border when focused
  - [x] scroll into view when focused
  - [x] use this component for editing past chats
  - [x] editor themes
  - [x] markdown syntax highlighting via codemirror
  - [x] spellcheck
  - [x] vim/emacs/sublime keybinding modes
  - [x] non-monospace font
  - [x] focus current line
  - [x] placeholder text
  - [x] drag and drop of images and other files
  - [x] cancel upload in progress
  - [x] don't allow send *during* upload.
  - [x] cancel upload that is finished and delete file
  - [x] paste of images
  - [x] change the path for file uploads to depend on the file being edited. Then move/copy makes WAY more sense and is more robust going forward.
  - [x] close file upload when input is blanked (i.e., on send)
  - [x] explicitly closing the file upload preview before submitting DELETES all the uploaded files.
  - [x] #now make file upload LOOK GOOD
  - [x] file upload button that pops open the dropzone or a file browser?  (useful for mobile and discoverability)


Stage 2 -- stretch goal challenges:
---
  - [ ] "Move" versus "Copy" when dragging/dropping?
  - [ ] improve file move and delete to be aware of images (?).
  - [ ] make upload link an immutable span of text?  Unclear, since user wants to edit the width and maybe style.  Hmmm... Unclear.
  - [ ] integrated preview
  - [ ] directions and links
  - [ ] hashtags
  - [ ] wysiwyg mode: via prosemirror?   maybe https://github.com/outline/rich-markdown-editor
  - [ ] emojis like on github?
  - [ ] BUG: very small file upload is BROKEN in cc-in-cc dev: this may be a proxy issue... exactly the same code works fine outside of cc-in-cc dev.

Use this for:
  - chat input
  - course editor conf fields involving markdown
  - markdown in jupyter
  - task editor (especially with #tag completion)

It will be a controlled component that takes project_id and path as input.
*/

// Note -- the old file upload used .chat-images for everything,
// rather than a directory for each file.
const AUX_FILE_EXT = "upload";

import { join } from "path";
import * as CodeMirror from "codemirror";
type EventHandlerFunction = (cm: CodeMirror.Editor) => void;
import { aux_file, len, path_split, trunc_middle, trunc } from "smc-util/misc";
import { IS_MOBILE } from "../../feature";
import { A } from "../../r_misc";
import {
  React,
  ReactDOM,
  useEffect,
  useRef,
  useRedux,
  useState,
  useTypedRedux,
  redux,
} from "../../app-framework";
import { Dropzone, FileUploadWrapper } from "../../file-upload";
import { alert_message } from "../../alerts";
import { Complete, Item } from "./complete";
import { submit_mentions } from "./mentions";
import { mentionableUsers } from "./mentionable-users";

const BLURED_STYLE: React.CSSProperties = {
  border: "1px solid rgb(204,204,204)", // focused will be rgb(112, 178, 230);
};

const FOCUSED_STYLE: React.CSSProperties = {
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
  value: string;
  onChange?: (value: string) => void;
  enableUpload?: boolean; // if true, enable drag-n-drop and pasted files
  onUploadStart?: () => void;
  onUploadEnd?: () => void;
  enableMentions?: boolean;
  submitMentionsRef?: any;
  style?: React.CSSProperties;
  onShiftEnter?: (value: string) => void; // also ctrl/alt/cmd-enter call this; see https://github.com/sagemathinc/cocalc/issues/1914
  onEscape?: () => void;
  onBlur?: (value: string) => void;
  onFocus?: () => void;
  placeholder?: string;
  height?: string;
  extraHelp?: string | JSX.Element;
  hideHelp?: boolean;
  fontSize?: number;
  styleActiveLine?: boolean;
  lineWrapping?: boolean;
  autoFocus?: boolean;
}

export const MarkdownInput: React.FC<Props> = ({
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
  onShiftEnter,
  onEscape,
  onBlur,
  onFocus,
  placeholder,
  height,
  extraHelp,
  hideHelp,
  fontSize,
  styleActiveLine,
  lineWrapping,
  autoFocus,
}) => {
  const cm = useRef<CodeMirror.Editor>();
  const textarea_ref = useRef<HTMLTextAreaElement>(null);
  const theme = useRedux(["account", "editor_settings", "theme"]);
  const bindings = useRedux(["account", "editor_settings", "bindings"]);
  const defaultFontSize = useTypedRedux("account", "font_size");

  const dropzone_ref = useRef<Dropzone>(null);
  const upload_close_preview_ref = useRef<Function | null>(null);
  const current_uploads_ref = useRef<{ [name: string]: boolean } | null>(null);
  const [is_focused, set_is_focused] = useState<boolean>(!!autoFocus);

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

  useEffect(() => {
    // initialize the codemirror editor
    const node = ReactDOM.findDOMNode(textarea_ref.current);
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

    const options = {
      inputStyle: "contenteditable" as "contenteditable", // needed for spellcheck to work!
      spellcheck: true,
      mode: {
        name: "gfm",
      },
      extraKeys,
      styleActiveLine,
      lineWrapping,
    };
    cm.current = CodeMirror.fromTextArea(node, options);
    // UNCOMMENT FOR DEBUGGING ONLY
    // (window as any).cm = cm.current;
    cm.current.setValue(value);
    if (onChange != null) {
      cm.current.on("change", (editor, change) => {
        if (change.origin == "setValue") {
          // Since this is a controlled component, firing onChange for this
          // could lead to an infinite loop and randomly crash the browser.
          return;
        }
        if (current_uploads_ref.current != null) {
          // IMPORTANT: we do NOT report the latest version back while
          // uploading files.  Otherwise, if more than one is being
          // uploaded at once, then we end up with an infinite loop
          // of updates.  In any case, once all the uploads finish
          // we'll start reporting chanages again.  This is fine
          // since you don't want to submit input *during* uploads anyways.
          return;
        }
        onChange(editor.getValue());
      });
    }

    if (onBlur != null) {
      cm.current.on("blur", (editor) => onBlur(editor.getValue()));
    }
    if (onFocus != null) {
      cm.current.on("focus", onFocus);
    }

    cm.current.on("blur", () => set_is_focused(false));
    cm.current.on("focus", () => set_is_focused(true));

    if (enableUpload) {
      // as any because the @types for codemirror are WRONG in this case.
      cm.current.on("paste", handle_paste_event as any);
    }

    const e: any = cm.current.getWrapperElement();
    e.setAttribute(
      "style",
      `height:100%; font-family:sans-serif !important;padding:${PADDING_TOP}px 12px`
    );

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
          const { from, to } = mark.find();
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
    // clean up
    return () => {
      if (cm.current == null) return;
      cm.current.getWrapperElement().remove();
      cm.current = undefined;
    };
  }, []);

  useEffect(() => {
    cm.current?.setOption("theme", theme == null ? "default" : theme);
  }, [theme]);

  useEffect(() => {
    if (bindings == null || bindings == "standard") {
      cm.current?.setOption("keyMap", "default");
    } else {
      cm.current?.setOption("keyMap", bindings);
    }
  }, [bindings]);

  useEffect(() => {
    if (cm.current == null || cm.current.getValue() === value) {
      return;
    }
    if (value == "") {
      // Important -- we *ONLY* set our value to the value prop
      // if it is to clear the input, which is the only case
      // where setting the value from outside is used (e.g. for chat).
      // This is not a realtime sync editing widget, and also
      // setting the value on any change may lead to an infinite
      // loop and hang (it actually won't because we test for that
      // in the change handler).  Also, setValue will mess with the cursor
      // (we could use my setValueNoJump plugin to get around that).
      cm.current.setValue(value);
      if (upload_close_preview_ref.current != null) {
        upload_close_preview_ref.current(true);
      }
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
    onChange?.(cm.current.getValue());
  }

  function upload_complete(file: {
    type: string;
    name: string;
    status: string;
  }): void {
    if (path == null) {
      throw Error("path must be set if enableUploads is set.");
    }

    // console.log("upload_complete", file);
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
    cm.current.setValue(input.replace(s0, s1));
    onChange?.(cm.current.getValue());
  }

  function upload_removed(file: { name: string; type: string }): void {
    if (cm.current == null) return;
    // console.log("upload_removed", file);
    if (project_id == null || path == null) {
      throw Error("project_id and path must be set if enableUploads is set.");
    }
    const input = cm.current.getValue();
    const s = upload_link(path, file);
    if (input.indexOf(s) == -1) {
      // not there anymore; maybe user already submitted -- do nothing further.
      return;
    }
    cm.current.setValue(input.replace(s, ""));
    onChange?.(cm.current.getValue());
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
    if (hideHelp) return;
    // TODO: make clicking on drag and drop thing pop up dialog
    return (
      <div
        style={{ color: "#767676", fontSize: "12.5px", marginBottom: "5px" }}
      >
        {render_mention_instructions()}
        {render_mention_email()}. Use{" "}
        <A href="https://help.github.com/articles/getting-started-with-writing-and-formatting-on-github/">
          Markdown
        </A>{" "}
        and{" "}
        <A href="https://en.wikibooks.org/wiki/LaTeX/Mathematics">
          LaTeX formulas
        </A>
        . {render_upload_instructions()}
        {extraHelp}
      </div>
    );
  }

  function render_desktop_instructions() {
    // TODO: make depend on the options
    // TODO: make clicking on drag and drop thing pop up dialog
    if (hideHelp) return;
    return (
      <div style={{ fontSize: "12.5px", marginBottom: "5px" }}>
        Shift+Enter when done. {render_mention_instructions()}
        Use{" "}
        <A href="https://help.github.com/articles/getting-started-with-writing-and-formatting-on-github/">
          Markdown
        </A>{" "}
        and{" "}
        <A href="https://en.wikibooks.org/wiki/LaTeX/Mathematics">
          LaTeX formulas
        </A>
        . {render_upload_instructions()}
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
        Use @name to refer to collaborators
        {render_mention_email()}.{" "}
      </>
    );
  }

  function render_upload_instructions(): JSX.Element | undefined {
    if (!enableUpload) return;
    const text = IS_MOBILE ? (
      <a>Tap here to attach files.</a>
    ) : (
      <>
        Attach files by dragging & dropping, <a>selecting</a> or pasting them.
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
        style={{
          ...(is_focused ? FOCUSED_STYLE : BLURED_STYLE),
          ...style,
          ...{ fontSize: `${fontSize ? fontSize : defaultFontSize}px`, height },
        }}
      >
        {render_mentions_popup()}
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
};

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
