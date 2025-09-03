/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Transforms } from "slate";
import { SlateEditor } from "./editable-markdown";
import { useEffect, useMemo, useRef } from "react";
import { Dropzone, BlobUpload } from "@cocalc/frontend/file-upload";
import { getFocus } from "./format/commands";
import { useFrameContext } from "@cocalc/frontend/frame-editors/frame-tree/frame-context";

export default function useUpload(
  editor: SlateEditor,
  body: React.JSX.Element,
): React.JSX.Element {
  const dropzoneRef = useRef<Dropzone>(null);
  const { actions, project_id, path } = useFrameContext();
  const actionsRef = useRef<any>(actions);
  actionsRef.current = actions;
  const pathRef = useRef<string>(path);
  pathRef.current = path;

  // We setup the slate "plugin" change to insertData here exactly once when
  // the component is mounted, because otherwise we would have to save
  // the dropzoneRef as an attribute on editor, which would make it not JSON-able.
  // Also, this simplifies using upload in editable-markdown.
  useEffect(() => {
    const { insertData } = editor;

    editor.insertData = (data) => {
      if (dropzoneRef?.current == null) {
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
            dropzoneRef?.current?.addFile(
              new File([blob], `paste-${Math.random()}`, { type: item.type }),
            );
          }
          return; // what if more than one ?
        }
      }
      insertData(data);
    };
  }, []);

  // NOTE: when updloadEventHandlers function changes the FileUploadWrapper doesn't properly update
  // to reflect that (it's wrapping a third party library).  (For some reason this wasn't an issue with
  // React 17, but is with React 18.) This is why we store what updloadEventHandlers
  // depends on in a ref and only create it once.
  const updloadEventHandlers = useMemo(() => {
    return {
      error: (_, message) => {
        if (actions?.set_error != null) {
          actions?.set_error(`${message}`);
        } else {
          console.warn("Error uploading file -- ", message);
        }
      },
      sending: ({ name }) => {
        actionsRef.current?.set_status?.(`Uploading ${name}...`);
      },
      complete: (file) => {
        actionsRef.current?.set_status?.("");
        const { url } = file;
        if (!url) {
          // probably an error
          return;
        }
        let node;
        const { height, upload } = file;
        const type = upload.chunks[0]?.file.type;
        if (!height && !type?.startsWith("image")) {
          node = {
            type: "link",
            isInline: true,
            children: [{ text: upload.filename ? upload.filename : "file" }],
            url,
          } as const;
        } else {
          node = {
            type: "image",
            isInline: true,
            isVoid: true,
            src: url,
            children: [{ text: "" }],
          } as const;
        }
        Transforms.insertFragment(editor, [node], {
          at: getFocus(editor),
        });
      },
    };
  }, []);

  return (
    <BlobUpload
      show_upload={false}
      className="smc-vfill"
      project_id={project_id}
      event_handlers={updloadEventHandlers}
      style={{ height: "100%", width: "100%" }}
      dropzone_ref={dropzoneRef}
    >
      {body}
    </BlobUpload>
  );
}
