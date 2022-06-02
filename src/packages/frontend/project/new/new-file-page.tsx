/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { useEffect, useState } from "react";
import { filename_extension, is_only_downloadable } from "@cocalc/util/misc";
import { default_filename as default_filename_alg } from "@cocalc/frontend/account";
import {
  Col,
  Row,
  Button,
  ButtonToolbar,
  FormControl,
  FormGroup,
  Alert,
} from "@cocalc/frontend/antd-bootstrap";
import {
  ErrorDisplay,
  Icon,
  Tip,
  SettingBox,
} from "@cocalc/frontend/components";
import { ProjectActions } from "@cocalc/frontend/project_actions";
import { special_filenames_with_no_extension } from "@cocalc/frontend/project-file";
import { FileUpload } from "@cocalc/frontend/file-upload";
import { NewFileButton } from "./new-file-button";
import { NewFileDropdown } from "./new-file-dropdown";
import { FileTypeSelector } from "./file-type-selector";
import { ProjectMap } from "@cocalc/frontend/todo-types";
import { PathNavigator } from "../explorer/path-navigator";
import { useRedux, useTypedRedux } from "@cocalc/frontend/app-framework";

interface Props {
  project_id: string;
  actions: ProjectActions;
  on_close?: () => void;
  on_create_file?: () => void;
  on_create_folder?: () => void;
  show_header?: boolean;
  default_filename?: string;
  name: string;
}

export default function NewFilePage(props: Props) {
  const { project_id, show_header = true } = props;
  function defaultFilename(): string {
    return default_filename_alg(undefined, project_id);
  }

  useEffect(() => {
    setFilename(props.default_filename ?? "");
  }, [props.default_filename]);

  const [extensionWarning, setExtensionWarning] = useState<boolean>(false);

  const current_path = useTypedRedux({ project_id }, "current_path");
  const defaultFilename0 = useTypedRedux({ project_id }, "default_filename");
  const [filename, setFilename] = useState<string>(
    defaultFilename0 ?? defaultFilename()
  );

  const file_creation_error = useTypedRedux(
    { project_id },
    "file_creation_error"
  );
  const downloading_file = useTypedRedux({ project_id }, "downloading_file");
  const project_map: ProjectMap | undefined = useRedux([
    "projects",
    "project_map",
  ]);
  const get_total_project_quotas = useRedux([
    "projects",
    "get_total_project_quotas",
  ]);

  function createFile(ext?: string): void {
    if (!filename) {
      return;
    }
    // If state.filename='a.txt', but ext is "sagews", we make the file
    // be called "a.sagews", not "a.txt.sagews":
    const filename_ext = filename_extension(filename);
    const name =
      filename_ext && ext && filename_ext != ext
        ? filename.slice(0, filename.length - filename_ext.length - 1)
        : filename;
    props.actions.create_file({
      name,
      ext,
      current_path,
    });
    props.on_create_file?.();
  }

  function submit(ext?: string): void {
    if (!filename) {
      // empty filename
      return;
    }
    if (ext || special_filenames_with_no_extension().indexOf(filename) > -1) {
      createFile(ext);
    } else if (filename[filename.length - 1] === "/") {
      createFolder();
    } else if (filename_extension(filename) || is_only_downloadable(filename)) {
      createFile();
    } else {
      setExtensionWarning(true);
    }
  }

  function renderError(): JSX.Element {
    let message;
    const error = file_creation_error;
    if (error === "not running") {
      message = "The project is not running. Please try again in a moment";
    } else {
      message = error;
    }
    return (
      <ErrorDisplay
        error={message}
        onClose={(): void => {
          props.actions.setState({ file_creation_error: "" });
        }}
      />
    );
  }

  function blocked(): string {
    if (project_map == null) {
      return "";
    }
    if (get_total_project_quotas(project_id)?.network) {
      return "";
    } else {
      return " (access blocked -- see project settings)";
    }
  }

  function createFolder(): void {
    props.actions.create_folder({
      name: filename,
      current_path,
      switch_over: true,
    });
    props.on_create_folder?.();
  }

  function renderNoExtensionAlert(): JSX.Element {
    return (
      <Alert
        bsStyle="warning"
        style={{ marginTop: "10px", fontWeight: "bold" }}
      >
        <p>
          Warning: Are you sure you want to create a file with no extension?
          This will use a plain text editor. If you do not want this, click a
          button below to create the corresponding type of file.
        </p>
        <ButtonToolbar style={{ marginTop: "10px" }}>
          <Button
            onClick={(): void => {
              createFile();
            }}
            bsStyle="success"
          >
            Yes, please create this file with no extension
          </Button>
          <Button
            onClick={(): void => {
              setExtensionWarning(false);
            }}
            bsStyle="default"
          >
            Cancel
          </Button>
        </ButtonToolbar>
      </Alert>
    );
  }

  function renderUpload(): JSX.Element {
    return (
      <>
        <Row style={{ marginTop: "20px" }}>
          <Col sm={12}>
            <h4>
              <Icon name="cloud-upload" /> Upload
            </h4>
          </Col>
        </Row>
        <Row>
          <Col sm={12}>
            <FileUpload
              dropzone_handler={{
                complete: (): void => {
                  props.actions.fetch_directory_listing();
                },
              }}
              project_id={project_id}
              current_path={current_path}
              show_header={false}
            />
          </Col>
        </Row>
        <Row>
          <Col sm={9}>
            <div style={{ color: "#666" }}>
              <em>
                Read about{" "}
                <a
                  href="https://doc.cocalc.com/howto/upload.html"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  other ways to upload files.
                </a>{" "}
                You can also drag & drop files on the file listing.
              </em>
            </div>
          </Col>
          <Col sm={3}>
            <Row>
              <Col sm={12}>
                <Button
                  onClick={props.on_close ?? showFiles}
                  className={"pull-right"}
                >
                  Close
                </Button>
              </Col>
            </Row>
          </Col>
        </Row>
      </>
    );
  }

  function renderCreate(): JSX.Element {
    let desc: string;
    if (filename.endsWith("/")) {
      desc = "folder";
    } else if (
      filename.toLowerCase().startsWith("http:") ||
      filename.toLowerCase().startsWith("https:")
    ) {
      desc = "download";
    } else {
      const ext = filename_extension(filename);
      if (ext) {
        desc = `${ext} file`;
      } else {
        desc = "file with no extension";
      }
    }
    return (
      <Tip
        icon="file"
        title={`Create ${desc}`}
        tip={`Create ${desc}.  You can also press return.`}
      >
        <Button disabled={filename.trim() == ""} onClick={submit}>
          Create {desc}
        </Button>
      </Tip>
    );
  }

  function renderFilenameForm(): JSX.Element {
    const onChange = (e): void => {
      if (extensionWarning) {
        setExtensionWarning(false);
      } else {
        setFilename(e.target.value);
      }
    };

    const onKey = (e: React.KeyboardEvent<FormControl>): void => {
      if (e.keyCode === 27) {
        props.on_close?.();
      }
    };

    return (
      <form
        onSubmit={(e): void => {
          e.preventDefault();
          submit();
        }}
      >
        <FormGroup>
          <FormControl
            autoFocus
            value={filename}
            type={"text"}
            disabled={extensionWarning}
            placeholder={"Name your file, folder, or a URL to download from..."}
            onChange={onChange}
            onKeyDown={onKey}
          />
        </FormGroup>
      </form>
    );
  }

  function showFiles(): void {
    props.actions.set_active_tab("files");
  }

  //key is so autofocus works below
  return (
    <SettingBox
      show_header={show_header}
      icon={"plus-circle"}
      title={"Create new files in"}
      subtitle={
        <PathNavigator
          project_id={project_id}
          style={{ display: "inline-block", fontSize: "20px" }}
        />
      }
      close={props.on_close ?? showFiles}
    >
      <Row key={"new-file-row"}>
        <Col sm={12}>
          <div
            style={{
              color: "#666",
              paddingBottom: "5px",
              fontSize: "16px",
            }}
          >
            Name your file, folder or paste in a link. End filename with / to
            make a folder.
          </div>
          <div
            style={{
              display: "flex",
              flexFlow: "row wrap",
              justifyContent: "space-between",
              alignItems: "stretch",
            }}
          >
            <div
              style={{
                flex: "1 0 auto",
                marginRight: "10px",
                minWidth: "20em",
              }}
            >
              {renderFilenameForm()}
            </div>
            <div style={{ flex: "0 0 auto", marginRight: "10px" }}>
              {renderCreate()}
            </div>
            <div style={{ flex: "0 0 auto" }}>
              <Tip
                icon="file"
                title="Any Type of File"
                tip="Create a wide range of files, including HTML, Markdown, C/C++ and Java programs, etc."
                placement="top"
              >
                <NewFileDropdown create_file={submit} />
              </Tip>
            </div>
          </div>
          {extensionWarning && renderNoExtensionAlert()}
          {file_creation_error && renderError()}
          <div
            style={{
              color: "#666",
              paddingBottom: "5px",
              fontSize: "16px",
            }}
          >
            What would you like to create? All documents can be simultaneously
            edited in realtime with your collaborators.
          </div>
          <FileTypeSelector
            create_file={submit}
            create_folder={createFolder}
            project_id={project_id}
          >
            <Tip
              title={"Download files from the Internet"}
              icon={"cloud"}
              placement={"bottom"}
              tip={`Paste a URL into the box above, then click here to download a file from the internet. ${blocked()}`}
            >
              <NewFileButton
                icon={"cloud"}
                name={`Download from Internet ${blocked()}`}
                on_click={createFile}
                loading={downloading_file}
              />
            </Tip>
          </FileTypeSelector>
        </Col>
      </Row>
      {renderUpload()}
    </SettingBox>
  );
}
