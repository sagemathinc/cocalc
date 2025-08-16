/*
Drag'n'Drop file upload area
*/

import Dropzone from "dropzone";
Dropzone.autoDiscover = false;
export { Dropzone };
import ReactDOMServer from "react-dom/server"; // for dropzone below
import { Button } from "antd";
import { join } from "path";
import { useIntl } from "react-intl";
import { redux, useTypedRedux } from "@cocalc/frontend/app-framework";
import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Icon, Tip } from "@cocalc/frontend/components";
import { useStudentProjectFunctionality } from "@cocalc/frontend/course";
import { appBasePath } from "@cocalc/frontend/customize/app-base-path";
import { labels } from "@cocalc/frontend/i18n";
import { BASE_URL } from "@cocalc/frontend/misc";
import { MAX_BLOB_SIZE } from "@cocalc/util/db-schema/blobs";
import { defaults, is_array, merge } from "@cocalc/util/misc";
import { alert_message } from "@cocalc/frontend/alerts";

// very large upload limit -- should be plenty?
// there is no cost for ingress, and as cocalc is a data plaform
// people like to upload large data sets.
const MAX_FILE_SIZE_MB = 50 * 1000;

const CHUNK_SIZE_MB = 8;

const TIMEOUT_S = 100;

const CLOSE_BUTTON_STYLE = {
  position: "absolute",
  right: "15px",
  top: "5px",
  zIndex: 1, // so it floats above text/markdown buttons
  background: "white",
  cursor: "pointer",
} as const;

/*
CHUNK_SIZE_MB being set properly is critical for cloudflare to work --
we want this to be as big as possible, but MUST be smaller than
200MB, and also must be uploadable in less than TIMEOUT_S seconds.

The internet says "The average U.S. fixed broadband download speed was 64.17 Mbps
(15th in the world) in the first half of 2017, while the average upload speed
was 22.79 Mbps (24th in the world), according to data released today from
internet speed test company Ookla".  My personal cellphone with 4 bars and
LTE gets about 8Mbs.    Since 8 Mbps is about 1MB/s.   Hence 8MB in 100
seconds seems a *safe* assumption....  If it really takes over a minute
to upload 8MB, then the user isn't going to upload a very big file anyways,
given TIMEOUT_S.

See also the discussion here: https://github.com/sagemathinc/cocalc-docker/issues/92
*/

// The corresponding server is in packages/hub/servers/app/upload.ts and significantly impacts
// our options!  It uses formidable to capture each chunk and then rewrites it using NATS which
// reads the data and writes it to disk.
const UPLOAD_OPTIONS = {
  maxFilesize: MAX_FILE_SIZE_MB,
  // use chunking data for ALL files -- this is good because it makes our server code simpler.
  forceChunking: true,
  chunking: true,
  chunkSize: CHUNK_SIZE_MB * 1000 * 1000,

  // We do NOT support chunk retries, since our server doesn't.  To support this, either our
  // NATS protocol becomes much more complicated, or our server has to store at least one chunk
  // in RAM before streaming it, which could potentially lead to a large amount of memory
  // usage, especially with malicious users.  If users really need a robust way to upload
  // a *lot* of data, they should use rsync.
  retryChunks: false,

  // matches what cloudflare imposes on us; this
  // is *per chunk*, so much larger uploads should still work.
  // This is per chunk:
  timeout: 1000 * TIMEOUT_S,

  // this is the default, but also I wrote the server (see packages/hub/servers/app/upload.ts) and
  // it doesn't support parallel chunks, which would use a lot more RAM on the server.  We might
  // consider this later...
  parallelChunkUploads: false,

  thumbnailWidth: 240,
  thumbnailheight: 240,
};

const DROPSTYLE = {
  border: "2px solid #ccc",
  boxShadow: "4px 4px 2px #bbb",
  borderRadius: "5px",
  padding: 0,
  margin: "10px 0",
  overflow: "auto",
} as const;

function Header({ close_preview }: { close_preview?: Function }) {
  return (
    <Tip
      icon="file"
      title="Drag and drop files"
      placement="bottom"
      tip="Drag and drop files from your computer into the box below to upload them into your project."
    >
      <h4 style={{ color: "#666", marginLeft: "10px" }}>
        Drag and drop files from your computer
        {close_preview && (
          <Button
            style={{ marginLeft: "30px" }}
            onClick={() => close_preview()}
          >
            Close
          </Button>
        )}
      </h4>
    </Tip>
  );
}

function postUrl(
  project_id: string,
  path: string,
  compute_server_id?: number,
): string {
  if (!project_id) {
    return join(appBasePath, "blobs");
  }
  if (compute_server_id == null) {
    compute_server_id =
      redux.getProjectStore(project_id).get("compute_server_id") ?? 0;
  }
  return join(
    appBasePath,
    `upload?project_id=${project_id}&compute_server_id=${compute_server_id}&path=${encodeURIComponent(path)}`,
  );
  //   return join(
  //     appBasePath,
  //     project_id,
  //     `raw/.smc/upload?dest_dir=${dest_dir}&compute_server_id=${compute_server_id}`,
  //   );
}

interface FileUploadProps {
  project_id: string;
  current_path: string;
  dropzone_handler?;
  close_button_onclick?: (event) => void;
  show_header: boolean;
  config?: object; // All supported dropzone.js config options
}

export function FileUpload({
  project_id,
  current_path,
  dropzone_handler,
  config,
}: FileUploadProps) {
  return (
    <FileUploadWrapper
      project_id={project_id}
      dest_path={current_path}
      event_handlers={dropzone_handler}
      config={{ clickable: ".dropzone-upload", ...config }}
    >
      <div
        style={{
          height: "200px",
          width: "100%",
          background: "#eee",
          fontSize: "18pt",
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          cursor: "pointer",
          borderRadius: "5px",
          border: "1px solid #ddd",
        }}
        className="dropzone-upload"
      >
        Drop Files Here (or click to upload)
      </div>
    </FileUploadWrapper>
  );
}

export interface DropzoneRef {
  current: Dropzone | null;
}

interface FileUploadWrapperProps {
  project_id: string; // The project to upload files to
  dest_path: string; // The path for files to be sent
  config?: object; // All supported dropzone.js config options
  event_handlers?: {
    complete?: Function | Function[];
    sending?: Function | Function[];
    removedfile?: Function | Function[];
  };
  preview_template?: Function; // See http://www.dropzonejs.com/#layout
  show_upload?: boolean; // Whether or not to show upload area
  on_close?: Function;
  disabled?: boolean;
  style?; // css styles to apply to the containing div
  dropzone_ref?: DropzoneRef; // gets set to underlying Dropzone instance
  close_preview_ref?: { current: Function | null }; // set to function to close the preview
  className?: string;
  trackMouse?: boolean; // if true, report mouse location as second arg to event handlers, so you know where something was dropped.
  children?: ReactNode;
}

export function FileUploadWrapper({
  project_id,
  dest_path,
  config = {},
  event_handlers,
  preview_template,
  show_upload = true,
  on_close,
  disabled: disabled0 = false,
  style,
  dropzone_ref,
  close_preview_ref,
  className,
  trackMouse,
  children,
}: FileUploadWrapperProps) {
  const student_project_functionality =
    useStudentProjectFunctionality(project_id);
  const disabled = disabled0 || student_project_functionality.disableUploads;
  const [files, set_files] = useState<string[]>([]);
  const preview_ref = useRef<any>(null);
  const zone_ref = useRef<any>(null);
  const dropzone = useRef<Dropzone>(null);
  const mouseEvt = useRef<any>(null);

  function get_djs_config() {
    // NOTE: Chunking is absolutely critical to get around hard limits in cloudflare!!
    // See https://github.com/sagemathinc/cocalc/issues/3716
    const with_defaults = defaults(
      config,
      {
        url: postUrl(project_id, dest_path),
        previewsContainer: preview_ref.current,
        previewTemplate: ReactDOMServer.renderToStaticMarkup(
          preview_template?.() ?? <DropzonePreview project_id={project_id} />,
        ),
        addRemoveLinks: event_handlers?.removedfile != null,
        ...UPLOAD_OPTIONS,
      },
      true,
    );
    return merge(with_defaults, config);
  }

  let queueDestroy: boolean = false;

  useEffect(() => {
    if (!disabled) {
      create_dropzone();
      set_up_events();
    }
    return () => {
      if (dropzone.current == null) {
        return;
      }

      const files = dropzone.current.getActiveFiles();

      if (files.length > 0) {
        // Stuff is still uploading...
        queueDestroy = true;
        let destroyInterval = setInterval(() => {
          if (!queueDestroy) {
            // If the component remounts somehow, don't destroy the dropzone.
            clearInterval(destroyInterval);
            return;
          }

          if (dropzone.current.getActiveFiles().length === 0) {
            destroy();
            clearInterval(destroyInterval);
          }
        }, 500);
      } else {
        destroy();
      }
    };
  }, []);

  useEffect(() => {
    if (disabled) {
      destroy();
    } else {
      create_dropzone();
      if (dropzone.current != null) {
        // see https://github.com/sagemathinc/cocalc/issues/2072
        dropzone.current.options = $.extend(
          true,
          {},
          dropzone.current.options,
          get_djs_config(),
        );
      }
    }
  });

  // If remove_all is true, then all files are also removed
  // from the dropzone.  This is true by default if there is
  // no "removedfile" handler, and false otherwise.
  function close_preview(
    remove_all: boolean = event_handlers?.removedfile == null,
  ) {
    if (typeof on_close === "function") {
      on_close();
    }
    if (remove_all && dropzone.current != null) {
      try {
        dropzone.current.removeAllFiles();
      } catch (_) {}
    }
    set_files([]);
  }
  if (close_preview_ref != null) {
    close_preview_ref.current = close_preview;
  }

  function render_preview() {
    let style;
    if (!show_upload || files.length === 0) {
      style = { display: "none" };
    } else {
      style = {};
    }

    return (
      <div style={style} className={className}>
        <div style={{ position: "relative" }}>
          <div className="close-button" style={CLOSE_BUTTON_STYLE}>
            <span
              onClick={() => {
                close_preview();
              }}
              className="close-button-x"
              style={{
                cursor: "pointer",
                fontSize: "18px",
                color: "gray",
              }}
            >
              <Icon name={"times"} />
            </span>
          </div>
        </div>
        {<Header close_preview={close_preview} />}
        <div
          ref={preview_ref}
          className="filepicker dropzone"
          style={DROPSTYLE}
        />
      </div>
    );
  }

  function create_dropzone(): void {
    if (dropzone.current == null && !disabled && zone_ref.current != null) {
      const dropzone_node = zone_ref.current;
      const config = get_djs_config();
      dropzone.current = new Dropzone(dropzone_node, config);
      if (dropzone_ref != null) {
        dropzone_ref.current = dropzone.current;
      }
      queueDestroy = false;
    }
  }

  function log(entry): void {
    if (project_id) {
      redux.getProjectActions(project_id).log(entry);
    }
  }

  function set_up_events(): void {
    if (dropzone.current == null || event_handlers == null) {
      return;
    }

    for (const name in event_handlers) {
      // Check if there's an array of event handlers
      let handlers = event_handlers[name];
      if (!is_array(handlers)) {
        handlers = [handlers];
      }
      for (let handler of handlers) {
        if (name === "init") {
          // Init handler:
          handler(dropzone.current);
        } else {
          // Event handler
          if (trackMouse) {
            dropzone.current.on(name, (e) => handler(e, mouseEvt.current));
          } else {
            dropzone.current.on(name, handler);
          }
        }
      }
    }

    dropzone.current.on("sending", function (file, _xhr, data) {
      // if file is actually a folder
      // Thanks to https://stackoverflow.com/questions/28200717/dropzone-js-and-full-path-for-each-file
      if (file.fullPath) {
        data.append("fullPath", file.fullPath);
      }
    });

    dropzone.current.on("addedfile", (file) => {
      if (!file) return;
      set_files(files.concat([file]));
      log({
        event: "file_action",
        action: "uploaded",
        file: join(dest_path, file.name),
      });
    });
  }

  // Removes ALL listeners and Destroys dropzone.
  // see https://github.com/enyo/dropzone/issues/1175
  function destroy(): void {
    if (dropzone.current == null) {
      return;
    }
    dropzone.current.off();
    dropzone.current.destroy();
    dropzone.current = null;
    if (dropzone_ref != null) {
      dropzone_ref.current = null;
    }
  }

  return (
    <div
      style={style}
      ref={zone_ref}
      className={className}
      onMouseMove={
        trackMouse
          ? (evt) => {
              mouseEvt.current = evt;
            }
          : undefined
      }
    >
      {!disabled ? render_preview() : undefined}
      {children}
    </div>
  );
}

interface DropzonePreviewProps {
  project_id: string;
}

function DropzonePreview({ project_id }: DropzonePreviewProps) {
  const state = useTypedRedux("projects", "project_map")?.getIn([
    project_id,
    "state",
    "state",
  ]);
  return (
    <div className="dz-preview dz-file-preview">
      {state != "running" && (
        <div style={{ background: "red", color: "white", padding: "5px" }}>
          You must start the project.
        </div>
      )}
      <div className="dz-details">
        <div className="dz-filename">
          <span data-dz-name></span>
        </div>
        <img data-dz-thumbnail />
      </div>
      <div className="dz-progress">
        <span className="dz-upload" data-dz-uploadprogress></span>
      </div>
      <div className="dz-success-mark">
        <span>
          <Icon name="check" />
        </span>
      </div>
      <div className="dz-error-mark">
        <span>
          <Icon name="times" />
        </span>
      </div>
      <div className="dz-error-message">
        <span data-dz-errormessage></span>
      </div>
    </div>
  );
}

export function UploadLink({
  project_id,
  path,
  onUpload,
  style,
}: {
  project_id: string;
  path: string;
  onUpload?: Function;
  style?;
}) {
  const intl = useIntl();

  return (
    <FileUploadWrapper
      project_id={project_id}
      dest_path={path}
      event_handlers={{ complete: onUpload }}
      config={{ clickable: ".cocalc-upload-link" }}
      style={{ display: "inline" }}
    >
      <a style={style} className="cocalc-upload-link">
        {intl.formatMessage(labels.upload)}
      </a>
    </FileUploadWrapper>
  );
}

export function BlobUpload(props) {
  const url = `${join(appBasePath, "blobs")}?project_id=${props.project_id}`;
  return (
    <FileUploadWrapper
      {...props}
      event_handlers={{
        ...props.event_handlers,
        sending: props.event_handlers?.sending,
        removedfile: props.event_handlers?.removedfile,
        complete: (file) => {
          if (file.xhr?.responseText) {
            let uuid;
            try {
              ({ uuid } = JSON.parse(file.xhr.responseText));
            } catch (err) {
              // this will happen if the server is down/broken, e.g., instead of proper json, we get
              // back an error from cloudflare.
              console.warn("WARNING: upload failure", file.xhr.responseText);
              alert_message({
                type: "error",
                message:
                  "Failed to upload. Server may be down.  Please try again later.",
              });
              return;
            }
            const url = `${BASE_URL}/blobs/${encodeURIComponent(
              file.upload.filename,
            )}?uuid=${uuid}`;
            props.event_handlers?.complete({ ...file, uuid, url });
          } else {
            // e.g., if there was an error
            props.event_handlers?.complete(file);
          }
        },
      }}
      dest_path={""}
      config={{
        url,
        maxFilesize: MAX_BLOB_SIZE / (1000 * 1000),
        ...props.config,
      }}
    />
  );
}
