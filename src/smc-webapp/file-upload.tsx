/*
Drag'n'Drop file upload area
*/

import * as Dropzone from "dropzone";
import {
  DropzoneComponent,
  DropzoneComponentHandlers,
} from "react-dropzone-component";

import * as ReactDOMServer from "react-dom/server"; // for dropzone below
import { encode_path, defaults, merge, is_array } from "smc-util/misc";
import {
  React,
  ReactDOM,
  redux,
  useState,
  useRef,
  useEffect,
} from "./app-framework";
import { Icon, Tip } from "./r_misc";
import { join } from "path";

// 3GB upload limit --  since that's the default filesystem quota
// and it should be plenty?
const MAX_FILE_SIZE_MB = 3000;

const CHUNK_SIZE_MB = 32;
/*
CHUNK_SIZE_MB being set properly is critical for cloudflare to work --
we want this to be as big as possible, but MUST be smaller than
200MB, and also must be uploadable in less than 100 seconds.

The internet says "The average U.S. fixed broadband download speed was 64.17 Mbps
(15th in the world) in the first half of 2017, while the average upload speed
was 22.79 Mbps (24th in the world), according to data released today from
internet speed test company Ookla". 23 Mbps is about 4MB/s.  If a user can
do 1MB/s, then they can upload 100MB in 100 seconds, hence 32MB in 100
seconds seems a reasonable assumption....  If it really takes over a minute
to upload 32MB, then the user isn't going to upload a very big file anyways,
given TIMEOUT_M.
*/

const DROPSTYLE: React.CSSProperties = {
  border: "2px solid #ccc",
  boxShadow: "4px 4px 2px #bbb",
  borderRadius: "5px",
  padding: 0,
  margin: "10px 0",
};

const Header = () => {
  return (
    <Tip
      icon="file"
      title="Drag and drop files"
      placement="bottom"
      tip="Drag and drop files from your computer into the box below to upload them into your project."
    >
      <h4 style={{ color: "#666" }}>Drag and drop files</h4>
    </Tip>
  );
};

function postUrl(project_id: string, path: string): string {
  const dest_dir = encode_path(path);
  return (
    window.app_base_url + `/${project_id}/raw/.smc/upload?dest_dir=${dest_dir}`
  );
}

interface FileUploadProps {
  project_id: string;
  current_path: string;
  dropzone_handler?: DropzoneComponentHandlers;
  close_button_onclick?: (event) => void;
  show_header: boolean;
}

export const FileUpload: React.FC<FileUploadProps> = (props) => {
  function dropzone_template() {
    return (
      <div className="dz-preview dz-file-preview">
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

  function render_close_button() {
    return (
      <div className="close-button pull-right">
        <span
          onClick={props.close_button_onclick}
          className="close-button-x"
          style={{ cursor: "pointer", fontSize: "18px", color: "gray" }}
        >
          <i className="fa fa-times"></i>
        </span>
      </div>
    );
  }

  return (
    <div>
      {props.close_button_onclick != null ? render_close_button() : undefined}
      {props.show_header ? <Header /> : undefined}
      <div style={DROPSTYLE}>
        <DropzoneComponent
          config={{ postUrl: postUrl(props.project_id, props.current_path) }}
          eventHandlers={props.dropzone_handler}
          djsConfig={{
            previewTemplate: ReactDOMServer.renderToStaticMarkup(
              dropzone_template()
            ),
            maxFilesize: MAX_FILE_SIZE_MB,
          }}
        />
      </div>
    </div>
  );
};

interface FileUploadWrapperProps {
  project_id: string; // The project to upload files to
  dest_path: string; // The path for files to be sent
  config?: object; // All supported dropzone.js config options
  event_handlers: { complete?: Function; sending?: Function };
  preview_template?: Function; // See http://www.dropzonejs.com/#layout
  show_upload?: boolean; // Whether or not to show upload area
  on_close?: Function;
  disabled?: boolean;
  style?: React.CSSProperties; // css styles to apply to the containing div
  dropzone_ref?: { current: Dropzone | null }; // gets set to underlying Dropzone instance
}

export const FileUploadWrapper: React.FC<FileUploadWrapperProps> = (props) => {
  const [files, set_files] = useState<string[]>([]);
  const preview_ref = useRef(null);
  const zone_ref = useRef(null);
  const dropzone = useRef<Dropzone | null>(null);

  function get_djs_config() {
    // NOTE: Chunking is absolutely critical to get around hard limits in cloudflare!!
    // See https://github.com/sagemathinc/cocalc/issues/3716
    const with_defaults = defaults(
      props.config,
      {
        url: postUrl(props.project_id, props.dest_path),
        previewsContainer:
          preview_ref.current != null
            ? ReactDOM.findDOMNode(preview_ref.current)
            : undefined,
        previewTemplate: ReactDOMServer.renderToStaticMarkup(
          preview_template()
        ),
        maxFilesize: MAX_FILE_SIZE_MB,
        chunking: true,
        chunkSize: CHUNK_SIZE_MB * 1000 * 1000,
        retryChunks: true, // might as well since it's a little more robust.
        timeout: 1000 * 100, // matches what cloudflare imposes on us; this
        // is *per chunk*, so much longer uploads should still work.
      },
      true
    );
    return merge(with_defaults, props.config);
  }

  let queueDestroy: boolean = false;

  useEffect(() => {
    if (!props.disabled) {
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
    if (props.disabled) {
      destroy();
    } else {
      create_dropzone();
      if (dropzone.current != null) {
        // see https://github.com/sagemathinc/cocalc/issues/2072
        dropzone.current.options = $.extend(
          true,
          {},
          dropzone.current.options,
          get_djs_config()
        );
      }
    }
  });

  function preview_template() {
    if (props.preview_template != null) {
      return props.preview_template();
    }

    return (
      <div className="dz-preview dz-file-preview">
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

  function close_preview() {
    if (typeof props.on_close === "function") {
      props.on_close();
    }
    if (dropzone.current != null) {
      dropzone.current.removeAllFiles();
    }
    set_files([]);
  }

  function render_preview() {
    let style;
    if (!props.show_upload || files.length === 0) {
      style = { display: "none" };
    }
    const box_style = {
      border: "2px solid #ccc",
      boxShadow: "4px 4px 2px #bbb",
      borderRadius: "5px",
      padding: 0,
      margin: "10px",
      minHeight: "40px",
    };

    return (
      <div style={style}>
        <div className="close-button pull-right">
          <span
            onClick={close_preview}
            className="close-button-x"
            style={{
              cursor: "pointer",
              fontSize: "18px",
              color: "gray",
              marginRight: "20px",
            }}
          >
            <i className="fa fa-times"></i>
          </span>
        </div>
        {<Header />}
        <div
          ref={preview_ref}
          className="filepicker dropzone"
          style={box_style}
        />
      </div>
    );
  }

  function create_dropzone(): void {
    if (
      dropzone.current == null &&
      !props.disabled &&
      zone_ref.current != null
    ) {
      const dropzone_node = ReactDOM.findDOMNode(zone_ref.current);
      const config = get_djs_config();
      dropzone.current = new Dropzone(dropzone_node, config);
      if (props.dropzone_ref != null) {
        props.dropzone_ref.current = dropzone.current;
      }
      queueDestroy = false;
    }
  }

  function log(entry): void {
    redux.getProjectActions(props.project_id).log(entry);
  }

  function set_up_events(): void {
    if (dropzone.current == null) {
      return;
    }

    for (const name in props.event_handlers) {
      // Check if there's an array of event handlers
      const handlers = props.event_handlers[name];
      if (is_array(handlers)) {
        for (let handler of handlers) {
          // Check if it's an init handler
          if (handler === "init") {
            handler(dropzone.current);
          } else {
            dropzone.current.on(name, handler);
          }
        }
      } else {
        if (name === "init") {
          handlers(dropzone.current);
        } else {
          dropzone.current.on(name, handlers);
        }
      }
    }

    dropzone.current.on("addedfile", (file) => {
      if (!file) return;
      set_files(files.concat([file]));
      log({
        event: "file_action",
        action: "uploaded",
        file: join(props.dest_path, file.name),
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
    if (props.dropzone_ref != null) {
      props.dropzone_ref.current = null;
    }
  }

  return (
    <div style={props.style} ref={zone_ref}>
      {!props.disabled ? render_preview() : undefined}
      {props.children}
    </div>
  );
};

FileUploadWrapper.defaultProps = {
  config: {},
  disabled: false,
  show_upload: true,
};
