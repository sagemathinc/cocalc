/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { Editor, Transforms } from "slate";
import { ReactEditor } from "./slate-react";
import { React, useRef } from "../../../app-framework";
import { Dropzone, FileUploadWrapper } from "../../../file-upload";
import { join } from "path";
import { aux_file, path_split } from "smc-util/misc";
const AUX_FILE_EXT = "upload";
import { getFocus } from "./format/commands";

export const withUpload = (editor: ReactEditor) => {
  const { insertData } = editor;

  editor.insertData = (data) => {
    if ((editor as any).dropzoneRef?.current == null) {
      // fallback
      insertData(data);
      return;
    }
    const items = data.items;
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item?.type.startsWith("image/")) {
        const file = item.getAsFile();
        if (file != null) {
          const blob = file.slice(0, -1, item.type);
          (editor as any).dropzoneRef?.current?.addFile(
            new File([blob], `paste-${Math.random()}`, { type: item.type })
          );
        }
        return; // what if more than one ?
      }
    }
    insertData(data);
  };

  return editor;
};

function uploadTarget(path: string, file: { name: string }): string {
  // path to our upload target, but relative to path.
  return join(path_split(aux_file(path, AUX_FILE_EXT)).tail, file.name);
}

export function useUpload(
  project_id: string,
  path: string,
  editor: Editor,
  body: JSX.Element
): JSX.Element {
  const dropzoneRef = useRef<Dropzone>(null);
  (editor as any).dropzoneRef = dropzoneRef;

  const updloadEventHandlers = {
    complete: (file: { type: string; name: string; status: string }) => {
      let node;
      if (file.type.indexOf("image") == -1) {
        node = {
          type: "link",
          isInline: true,
          children: [{ text: file.name }],
          url: uploadTarget(path, file),
        };
      } else {
        node = {
          type: "image",
          isInline: true,
          isVoid: true,
          src: uploadTarget(path, file),
          children: [{ text: "" }],
        };
      }
      Transforms.insertFragment(editor, [node as any], {
        at: getFocus(editor),
      });
    },
  };

  return (
    <FileUploadWrapper
      className="smc-vfill"
      project_id={project_id}
      dest_path={aux_file(path, AUX_FILE_EXT)}
      event_handlers={updloadEventHandlers}
      style={{ height: "100%", width: "100%" }}
      dropzone_ref={dropzoneRef}
    >
      {body}
    </FileUploadWrapper>
  );
}
