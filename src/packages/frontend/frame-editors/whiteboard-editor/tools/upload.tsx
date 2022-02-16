import { ReactNode, RefObject, useRef } from "react";
import { Dropzone, FileUploadWrapper } from "@cocalc/frontend/file-upload";
import { aux_file } from "@cocalc/util/misc";
const AUX_FILE_EXT = "upload";
import { useFrameContext } from "../hooks";
import { join } from "path";

interface Props {
  evtToDataRef: RefObject<Function | null>;
  children: ReactNode;
  readOnly?: boolean; // this just completely disables it.
}

export default function Upload({ children, evtToDataRef, readOnly }: Props) {
  const { actions, path, project_id } = useFrameContext();
  const dropzoneRef = useRef<Dropzone>(null);

  if (readOnly) {
    return <>{children}</>;
  }

  const dest_path = aux_file(path, AUX_FILE_EXT);

  const updloadEventHandlers = {
    sending: ({ name }) => {
      actions.set_status(`Uploading ${name}...`);
    },
    complete: (file: { type: string; name: string; status: string }, mouse) => {
      actions.set_status("");
      // todo -- check status?
      // TOOD: this is the wrong location - should instead just let canvas save mouse location in a ref,
      // and don't involve Dropzone at all.
      const location = evtToDataRef.current?.(mouse) ?? { x: 0, y: 0 };
      let str: string;
      const filename = join(dest_path, file.name);
      if (file.type.indexOf("image") == -1) {
        // not an image
        str = `<a href="${filename}">${filename}</a>`;
      } else {
        // is an image
        str = `<img src="${filename}" style="object-fit:cover"/>`;
      }
      actions.createElement({
        ...location,
        type: "text",
        str,
      });
    },
  };

  return (
    <FileUploadWrapper
      className="smc-vfill"
      project_id={project_id}
      dest_path={dest_path}
      event_handlers={updloadEventHandlers}
      style={{ height: "100%", width: "100%" }}
      dropzone_ref={dropzoneRef}
      show_upload={false}
      trackMouse
    >
      {children}
    </FileUploadWrapper>
  );
}
