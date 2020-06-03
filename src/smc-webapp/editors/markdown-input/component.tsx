/*
Markdown editor

Stage 1 -- enough to replace current chat input:
  - [ ] use this component for editing past chats
     - [ ] shift+enter to submit isn't working
     - [ ] image upload doesn't set link properly
  - [ ] different border when focused
  - [ ] @mentions (via completion dialog) -the collabs on this project
     - get rid of the "enable_mentions" account pref flag and data -- always have it
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
  - [ ] improve move and delete to be aware of images (?).
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

import { aux_file, len, path_split } from "smc-util/misc2";
//import { emoticons } from "smc-util/misc";

import { IS_MOBILE } from "../../feature";
import { A } from "../../r_misc";
import {
  React,
  ReactDOM,
  useEffect,
  useRef,
  useRedux,
  redux,
} from "../../app-framework";
import { Dropzone, FileUploadWrapper } from "../../file-upload";
import { alert_message } from "../../alerts";

const STYLE: React.CSSProperties = {
  border: "1px solid rgb(204,204,204)", // focused will be rgb(112, 178, 230);
};

interface Props {
  project_id: string;
  path: string;
  value: string;
  onChange: (value: string) => void;
  enableUpload?: boolean; // if true, enable drag-n-drop and pasted files
  onUploadStart?: () => void;
  onUploadEnd?: () => void;
  enableMentions?: boolean;
  style?: React.CSSProperties;
  onShiftEnter?: () => void;
  onEscape?: () => void;
  onBlur?: () => void;
  placeholder?: string;
  height?: string;
  extraHelp?: string | JSX.Element;
  fontSize?: number;
}
export const MarkdownInput: React.FC<Props> = ({
  project_id,
  path,
  value,
  enableUpload,
  onUploadStart,
  onUploadEnd,
  enableMentions,
  style,
  onChange,
  onShiftEnter,
  onEscape,
  onBlur,
  placeholder,
  height,
  extraHelp,
  fontSize,
}) => {
  // @ts-ignore
  const deleteme = [project_id, path, enableUpload, enableMentions];

  const cm = useRef<CodeMirror.Editor>();
  const textarea_ref = useRef<HTMLTextAreaElement>(null);
  const theme = useRedux(["account", "editor_settings", "theme"]);
  const bindings = useRedux(["account", "editor_settings", "bindings"]);
  const defaultFontSize = useRedux(["account", "font_size"]);

  const dropzone_ref = useRef<Dropzone>(null);
  const upload_close_preview_ref = useRef<Function>(null);
  const current_uploads_ref = useRef<{ [name: string]: boolean } | null>(null);

  useEffect(() => {
    // initialize the codemirror editor
    const node = ReactDOM.findDOMNode(textarea_ref.current);
    const extraKeys: CodeMirror.KeyMap = {};
    if (onShiftEnter != null) {
      extraKeys["Shift-Enter"] = () => onShiftEnter();
    }
    if (onEscape != null) {
      extraKeys["Esc"] = () => onEscape();
    }
    const options = {
      inputStyle: "contenteditable" as "contenteditable", // needed for spellcheck to work!
      spellcheck: true,
      mode: {
        name: "gfm",
      },
      extraKeys,
      styleActiveLine: true,
      lineWrapping: true,
    };
    cm.current = CodeMirror.fromTextArea(node, options);
    cm.current.setValue(value);
    cm.current.on("change", (editor) => {
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

    if (onBlur != null) {
      cm.current.on("blur", () => onBlur());
    }

    if (enableUpload) {
      // as any because the @types for codemirror are WRONG in this case.
      cm.current.on("paste", handle_paste_event as any);
    }

    const e: any = cm.current.getWrapperElement();
    e.setAttribute(
      "style",
      "height:100%; font-family:sans-serif !important;padding:6px 12px"
    );

    cm.current.focus();

    // clean up
    return () => {
      if (cm.current == null) return;
      cm.current.getWrapperElement().remove();
      cm.current = undefined;
    };
  }, []);

  useEffect(() => {
    cm.current?.setOption("theme", theme);
  }, [theme]);

  useEffect(() => {
    if (bindings == null || bindings == "standard") {
      cm.current?.setOption("keyMap", "default");
    } else {
      cm.current?.setOption("keyMap", bindings);
    }
  }, [bindings]);

  useEffect(() => {
    if (cm.current == null || cm.current.getValue() === value) return;
    cm.current.setValue(value);
    if (value == "") {
      if (upload_close_preview_ref.current != null) {
        upload_close_preview_ref.current(true);
      }
    }
  }, [value]);

  function upload_sending(file: { name: string }): void {
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
  }

  function upload_complete(file: {
    type: string;
    name: string;
    status: string;
  }): void {
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
  }

  function upload_removed(file: { name: string; type: string }): void {
    if (cm.current == null) return;
    // console.log("upload_removed", file);
    const input = cm.current.getValue();
    const s = upload_link(path, file);
    if (input.indexOf(s) == -1) {
      // not there anymore; maybe user already submitted -- do nothing further.
      return;
    }
    cm.current.setValue(input.replace(s, ""));
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
    if (!redux.getStore("projects").has_internet_access(project_id)) {
      return <span> (enable the Internet Access upgrade to send emails)</span>;
    }
  }

  function render_mobile_instructions() {
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
        . {render_upload_instructions()} Attach files... {extraHelp}
      </div>
    );
  }

  function render_desktop_instructions() {
    // TODO: make depend on the options
    // TODO: make clicking on drag and drop thing pop up dialog
    return (
      <div style={{ fontSize: "12.5px", marginBottom: "5px" }}>
        Shift+Enter to send.
        {render_mention_instructions()}
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
        Use @name to mention collaborators
        {render_mention_email()}.{" "}
      </>
    );
  }

  function render_upload_instructions(): JSX.Element | undefined {
    if (!enableUpload) return;
    const text = IS_MOBILE
      ? "Attach files..."
      : "Attach files by dragging & dropping, selecting or pasting them.";
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

  let body: JSX.Element = (
    <div>
      {value != "" ? render_instructions() : undefined}
      <div
        style={{
          ...STYLE,
          ...style,
          ...{ fontSize: `${fontSize ? fontSize : defaultFontSize}px`, height },
        }}
      >
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
