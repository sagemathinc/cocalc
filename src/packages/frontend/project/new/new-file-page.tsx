/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { useState } from "react";

import { default_filename } from "@cocalc/frontend/account";
import {
  Alert,
  Button,
  ButtonToolbar,
  Col,
  FormControl,
  FormGroup,
  Row,
} from "@cocalc/frontend/antd-bootstrap";
import {
  ProjectActions,
  useActions,
  useRedux,
  useTypedRedux,
} from "@cocalc/frontend/app-framework";
import {
  ErrorDisplay,
  Icon,
  Loading,
  Paragraph,
  SettingBox,
  Tip,
} from "@cocalc/frontend/components";
import { FileUpload } from "@cocalc/frontend/file-upload";
import { special_filenames_with_no_extension } from "@cocalc/frontend/project-file";
import { ProjectMap } from "@cocalc/frontend/todo-types";
import { filename_extension, is_only_downloadable } from "@cocalc/util/misc";
import { PathNavigator } from "../explorer/path-navigator";
import { FileTypeSelector } from "./file-type-selector";
import { NewFileButton } from "./new-file-button";
import { NewFileDropdown } from "./new-file-dropdown";
import { COLORS } from "@cocalc/util/theme";

interface Props {
  project_id: string;
}

export default function NewFilePage(props: Props) {
  const { project_id } = props;
  const actions = useActions({ project_id });
  const [extensionWarning, setExtensionWarning] = useState<boolean>(false);
  const current_path = useTypedRedux({ project_id }, "current_path");
  const filename0 = useTypedRedux({ project_id }, "default_filename");
  const [filename, setFilename] = useState<string>(
    filename0 ? filename0 : default_filename(undefined, project_id)
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

  if (actions == null) {
    return <Loading theme="medium" />;
  }

  function getActions(): ProjectActions {
    if (actions == null) throw new Error("bug");
    return actions;
  }

  function createFile(ext?: string) {
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
    getActions().create_file({
      name,
      ext,
      current_path,
    });
  }

  function submit(ext?: string) {
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

  function renderError() {
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
          getActions().setState({ file_creation_error: "" });
        }}
      />
    );
  }

  function blocked() {
    if (project_map == null) {
      return "";
    }
    if (get_total_project_quotas(project_id)?.network) {
      return "";
    } else {
      return " (access blocked -- see project settings)";
    }
  }

  function createFolder() {
    getActions().create_folder({
      name: filename,
      current_path,
      switch_over: true,
    });
  }

  function renderNoExtensionAlert() {
    return (
      <Alert
        bsStyle="warning"
        style={{ marginTop: "10px", marginBottom: "10px", fontWeight: "bold" }}
      >
        <Paragraph>
          Warning: Are you sure you want to create a file with no extension?
          This will use a plain text editor. If you do not want this, click a
          button below to create the corresponding type of file.
        </Paragraph>
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

  function renderUpload() {
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
                  getActions().fetch_directory_listing();
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
                <Button onClick={showFiles} className={"pull-right"}>
                  Close
                </Button>
              </Col>
            </Row>
          </Col>
        </Row>
      </>
    );
  }

  const renderCreate = () => {
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
        <Button disabled={filename.trim() == ""} onClick={() => submit()}>
          Create {desc}
        </Button>
      </Tip>
    );
  };

  const renderFilenameForm = () => {
    const onChange = (e): void => {
      if (extensionWarning) {
        setExtensionWarning(false);
      } else {
        setFilename(e.target.value);
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
          />
        </FormGroup>
      </form>
    );
  };

  const showFiles = () => {
    actions.set_active_tab("files");
  };

  //key is so autofocus works below
  return (
    <SettingBox
      show_header
      icon={"plus-circle"}
      title={"Create new file or directory"}
      subtitle={
        <PathNavigator
          project_id={project_id}
          style={{ display: "inline-block", fontSize: "20px" }}
        />
      }
      close={showFiles}
    >
      <Row key={"new-file-row"}>
        <Col sm={12}>
          <Paragraph
            style={{
              color: COLORS.GRAY_M,
              fontSize: "16px",
            }}
          >
            Name your file, folder or paste in a link. End filename with / to
            make a folder.
          </Paragraph>
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
          <Paragraph
            style={{
              color: COLORS.GRAY_M,
              fontSize: "16px",
            }}
          >
            What would you like to create? All documents can be simultaneously
            edited in realtime with your collaborators.
          </Paragraph>
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
                on_click={() => createFile()}
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
