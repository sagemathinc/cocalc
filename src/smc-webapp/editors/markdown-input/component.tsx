/*
Markdown editor

Stage 1 -- enough to replace current chat input:
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
  - [ ] cancel upload that is finished
  - [ ] paste of images and files
  - [ ] @mentions (via completion dialog) -the collabs on this project
  - [ ] make file upload LOOK GOOD
  - [ ] close file upload when input is blanked (i.e., on send)

Stage 2 -- stretch goal challenges:
---
  - [ ] bonus: don't insert the link inside of an existing link tag...
  - [ ] border when focused
  - [ ] preview
  - [ ] directions and links
  - [ ] hashtags
  - [ ] wysiwyg mode: via prosemirror?   maybe https://github.com/outline/rich-markdown-editor
  - [ ] emojis like on github?

Use this for:
  - chat input
  - course editor conf fields involving markdown
  - markdown in jupyter
  - task editor (especially with #tag completion)

It will be a controlled component that takes project_id and path as input.
*/

// Note -- we make the dest_path .chat-images, mainly for backward
// compatibility, since it can be used for any files (not just images),
// and this can be used for more than just chat.
const UPLOAD_PATH = ".chat-images";

import { join } from "path";
import * as CodeMirror from "codemirror";

import { len, path_split } from "smc-util/misc2";

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
}) => {
  // @ts-ignore
  const deleteme = [project_id, path, enableUpload, enableMentions];

  const cm = useRef<CodeMirror.Editor>();
  const textarea_ref = useRef<HTMLTextAreaElement>(null);
  const theme = useRedux(["account", "editor_settings", "theme"]);
  const bindings = useRedux(["account", "editor_settings", "bindings"]);
  const fontSize = useRedux(["account", "font_size"]);

  const dropzone_ref = useRef<Dropzone>(null);
  const close_preview_ref = useRef<Function>(null);
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

    const e: any = cm.current.getWrapperElement();
    e.setAttribute(
      "style",
      "height:100%; font-family:sans-serif !important;padding:6px 12px"
    );

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
    const s = upload_temp_link(file);
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
    const s0 = upload_temp_link(file);
    let s1: string;
    if (file.status == "error") {
      s1 = "";
      alert_message({ type: "error", message: "Error uploading file." });
    } else if (file.status == "canceled") {
      // users can cancel files when they are being uploaded.
      s1 = "";
    } else {
      s1 = upload_link(file);
    }
    cm.current.setValue(input.replace(s0, s1));
  }

  function upload_removed(file: { name: string; type: string }): void {
    if (cm.current == null) return;
    // console.log("upload_removed", file);
    const input = cm.current.getValue();
    const s = upload_link(file);
    if (input.indexOf(s) == -1) {
      // not there anymore; maybe user already submitted -- do nothing further.
      return;
    }
    cm.current.setValue(input.replace(s, ""));
    // delete from project itself
    const target = join(path_split(path).head, upload_target(file));
    // console.log("deleting target", target, { paths: [target] });
    redux.getProjectActions(project_id).delete_files({ paths: [target] });
  }

  let body: JSX.Element = (
    <div style={{ ...STYLE, ...style, ...{ fontSize: `${fontSize}px` } }}>
      <textarea
        style={{ display: "none" }}
        ref={textarea_ref}
        placeholder={placeholder}
      />
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
        dest_path={join(path_split(path).head, UPLOAD_PATH)}
        event_handlers={event_handlers}
        style={{ height: "100%" }}
        dropzone_ref={dropzone_ref}
        close_preview_ref={close_preview_ref}
      >
        {body}
      </FileUploadWrapper>
    );
  }

  return body;
};

function upload_target(file: { name: string }): string {
  return join(UPLOAD_PATH, file.name);
}

function upload_temp_link(file: { name: string }): string {
  return `[Uploading...]\(${file.name}\)`;
}

function upload_link(file: { name: string; type: string }): string {
  const target = upload_target(file);
  if (file.type.indexOf("image") !== -1) {
    return `<img src=\"${target}\" style="max-width:100%" />`;
  } else {
    // We use an a tag instead of [${file.name}](${target}) because for
    // some files (e.g,. word doc files) our markdown renderer inexplicably
    // does NOT render them as links!?  a tags work though.
    return `<a href=\"${target}\">${file.name}</a>`;
  }
}
