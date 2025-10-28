/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Button, Input, Modal, Space } from "antd";
import { useEffect, useRef, useState } from "react";
import { defineMessage, FormattedMessage, useIntl } from "react-intl";

import { default_filename } from "@cocalc/frontend/account";
import { Alert, Col, Row } from "@cocalc/frontend/antd-bootstrap";
import {
  ProjectActions,
  redux,
  useActions,
  useRedux,
  useTypedRedux,
} from "@cocalc/frontend/app-framework";
import {
  A,
  ErrorDisplay,
  Icon,
  Loading,
  Paragraph,
  SettingBox,
  Tip,
} from "@cocalc/frontend/components";
import FakeProgress from "@cocalc/frontend/components/fake-progress";
import ComputeServer from "@cocalc/frontend/compute/inline";
import { filenameIcon } from "@cocalc/frontend/file-associations";
import { FileUpload, UploadLink } from "@cocalc/frontend/file-upload";
import { labels } from "@cocalc/frontend/i18n";
import { special_filenames_with_no_extension } from "@cocalc/frontend/project-file";
import { getValidActivityBarOption } from "@cocalc/frontend/project/page/activity-bar";
import { ACTIVITY_BAR_KEY } from "@cocalc/frontend/project/page/activity-bar-consts";
import { ProjectMap } from "@cocalc/frontend/todo-types";
import { filename_extension, is_only_downloadable } from "@cocalc/util/misc";
import { COLORS } from "@cocalc/util/theme";
import { PathNavigator } from "../explorer/path-navigator";
import { useAvailableFeatures } from "../use-available-features";
import { FileTypeSelector } from "./file-type-selector";
import { NewFileButton } from "./new-file-button";
import { NewFileDropdown } from "./new-file-dropdown";

const CREATE_MSG = defineMessage({
  id: "project.new.new-file-page.create.title",
  defaultMessage: `Create {desc}`,
  description: "creating a file with the given description in a file-system",
});

interface Props {
  project_id: string;
}

export default function NewFilePage(props: Props) {
  const intl = useIntl();
  const [createFolderModal, setCreateFolderModal] = useState<boolean>(false);
  const createFolderModalRef = useRef<any>(null);
  useEffect(() => {
    setTimeout(() => {
      if (createFolderModal && createFolderModalRef.current) {
        createFolderModalRef.current.focus();
        createFolderModalRef.current.select();
      }
    }, 1);
  }, [createFolderModal]);
  const inputRef = useRef<any>(null);
  useEffect(() => {
    setTimeout(() => {
      if (inputRef.current) {
        inputRef.current.focus();
        inputRef.current.select();
      }
    }, 1);
  }, []);
  const { project_id } = props;
  const compute_server_id = useTypedRedux({ project_id }, "compute_server_id");
  const actions = useActions({ project_id });
  const availableFeatures = useAvailableFeatures(project_id);
  const [extensionWarning, setExtensionWarning] = useState<boolean>(false);
  const current_path = useTypedRedux({ project_id }, "current_path");
  const filename0 = useTypedRedux({ project_id }, "default_filename");
  const [filename, setFilename] = useState<string>(
    filename0 ? filename0 : default_filename(undefined, project_id),
  );
  const [filenameChanged, setFilenameChanged] = useState<boolean>(false);
  const file_creation_error = useTypedRedux(
    { project_id },
    "file_creation_error",
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

  const [creatingFile, setCreatingFile] = useState<string>("");

  async function createFile(ext?: string) {
    const filename = inputRef.current?.input.value;
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
    try {
      setCreatingFile(name + (ext ? "." + ext : ""));
      await getActions().create_file({
        name,
        ext,
        current_path,
      });
    } finally {
      setCreatingFile("");
    }
  }

  function submit(ext?: string) {
    const filename = inputRef.current?.input.value;
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
        <Space>
          <Button
            onClick={(): void => {
              createFile();
            }}
            type="primary"
          >
            Yes, please create this file with no extension
          </Button>
          <Button
            onClick={(): void => {
              setExtensionWarning(false);
            }}
          >
            {intl.formatMessage(labels.cancel)}
          </Button>
        </Space>
      </Alert>
    );
  }

  function renderUpload() {
    return (
      <>
        <Row style={{ marginTop: "20px" }}>
          <Col sm={12}>
            <h4>
              <Icon name="cloud-upload" />{" "}
              <FormattedMessage
                id="project.new.new-file-page.upload.title"
                defaultMessage={"Upload Files"}
              />
            </h4>
          </Col>
        </Row>
        <Row>
          <Col sm={24}>
            <div style={{ color: COLORS.GRAY_M, fontSize: "12pt" }}>
              <FormattedMessage
                id="project.new.new-file-page.upload.description"
                defaultMessage={`You can drop one or more files here or on the Explorer file listing.
                  See <A>documentation</A> for more ways to get your files into your project.`}
                values={{
                  A: (c) => (
                    <A href="https://doc.cocalc.com/howto/upload.html">{c}</A>
                  ),
                }}
              />
            </div>
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
      </>
    );
  }

  const renderCreate = () => {
    let desc: string;
    const ext = filename_extension(filename);
    if (filename.endsWith("/")) {
      desc = intl.formatMessage(labels.folder);
    } else if (
      filename.toLowerCase().startsWith("http:") ||
      filename.toLowerCase().startsWith("https:")
    ) {
      desc = intl.formatMessage(labels.download);
    } else {
      if (ext) {
        desc = intl.formatMessage(
          {
            id: "project.new.new-file-page.create.desc_file",
            defaultMessage: "{ext} file",
            description: "An extension-named file on a button",
          },
          { ext },
        );
      } else {
        desc = intl.formatMessage({
          id: "project.new.new-file-page.create.desc_no_ext",
          defaultMessage: "File with no extension",
          description: "A filename without an extension",
        });
      }
    }
    const title = intl.formatMessage(CREATE_MSG, { desc });

    return (
      <Space>
        {!ext && !filename.endsWith("/") && (
          <Button size="large" onClick={() => createFolder()}>
            <Icon name="folder" />{" "}
            {intl.formatMessage(CREATE_MSG, {
              desc: intl.formatMessage(labels.folder),
            })}
          </Button>
        )}
        <Tip
          icon="file"
          title={title}
          tip={intl.formatMessage(
            {
              id: "project.new.new-file-page.create.tooltip",
              defaultMessage: `{title}.  You can also press return.`,
              description:
                "Informing the user in this tooltip, that it is also possible to press the return key",
            },
            { title },
          )}
        >
          <Button
            size="large"
            disabled={filename.trim() == ""}
            onClick={() => submit()}
          >
            <Icon name={filenameIcon(filename)} />{" "}
            {intl.formatMessage(CREATE_MSG, { desc })}
          </Button>
        </Tip>
      </Space>
    );
  };

  function closeNewPage() {
    // Showing homepage in flyout only mode, otherwise the files as usual
    const account_store = redux.getStore("account") as any;
    const actBar = account_store?.getIn(["other_settings", ACTIVITY_BAR_KEY]);
    const pureFlyoutMode = getValidActivityBarOption(actBar) === "flyout";
    actions?.set_active_tab(pureFlyoutMode ? "home" : "files");
  }

  //key is so autofocus works below
  return (
    <SettingBox
      style={{ marginTop: "20px" }}
      show_header
      icon={"plus-circle"}
      title={
        <span>
          &nbsp;
          <FormattedMessage
            id="project.new-file-page.title"
            defaultMessage={
              "Create or {upload} New File or <folder>Folder</folder>"
            }
            values={{
              upload: (
                <UploadLink
                  project_id={project_id}
                  path={current_path}
                  onUpload={() => getActions().fetch_directory_listing()}
                />
              ),
              folder: (txt) => (
                <a
                  onClick={() => {
                    setCreateFolderModal(true);
                  }}
                >
                  {txt}
                </a>
              ),
            }}
          />
          <Modal
            open={createFolderModal}
            title={intl.formatMessage({
              id: "project.new-file-page.title.modal.title",
              defaultMessage: "Create New Folder",
            })}
            onCancel={() => setCreateFolderModal(false)}
            onOk={() => {
              setCreateFolderModal(false);
              if (filename) {
                createFolder();
              }
            }}
          >
            <div style={{ textAlign: "center" }}>
              <Input
                ref={createFolderModalRef}
                style={{ margin: "15px 0" }}
                autoFocus
                size="large"
                value={filename}
                onChange={(e) => setFilename(e.target.value)}
                onPressEnter={() => {
                  setCreateFolderModal(false);
                  if (filename) {
                    createFolder();
                  }
                }}
              />
            </div>
          </Modal>
        </span>
      }
      subtitle={
        <div>
          <PathNavigator
            project_id={project_id}
            style={{ display: "inline-block", fontSize: "20px" }}
          />
          {!!compute_server_id && (
            <h4 style={{ display: "inline-block", fontSize: "20px" }}>
              {" on "}
              <ComputeServer id={compute_server_id} />
            </h4>
          )}
        </div>
      }
      close={closeNewPage}
    >
      <Modal
        onCancel={() => setCreatingFile("")}
        open={!!creatingFile}
        title={`Creating ${creatingFile}...`}
        footer={<></>}
      >
        <div style={{ textAlign: "center" }}>
          <FakeProgress time={4000} />
        </div>
      </Modal>
      <Row key={"new-file-row"}>
        <Col sm={12}>
          <Paragraph
            style={{
              color: COLORS.GRAY_M,
              fontSize: "16px",
            }}
          >
            <FormattedMessage
              id="new.file-type-page.header.intro"
              defaultMessage="Name your file, folder or paste in a link. End name with / to make a folder."
            />
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
              <Input
                size="large"
                ref={inputRef}
                autoFocus
                value={filename}
                disabled={extensionWarning}
                placeholder={
                  "Name your file, folder, or a URL to download from..."
                }
                onChange={(e) => {
                  setFilenameChanged(true);
                  if (extensionWarning) {
                    setExtensionWarning(false);
                  } else {
                    setFilename(e.target.value);
                  }
                }}
                onPressEnter={() => submit()}
              />
            </div>
            <div style={{ flex: "0 0 auto", marginRight: "10px" }}>
              {renderCreate()}
            </div>
            <div style={{ flex: "0 0 auto" }}>
              <NewFileDropdown create_file={submit} mode="project" />
            </div>
          </div>
          {extensionWarning && renderNoExtensionAlert()}
          {file_creation_error && renderError()}
          <Paragraph
            style={{
              color: COLORS.GRAY_M,
              fontSize: "16px",
              marginTop: "15px",
            }}
          >
            <FormattedMessage
              id="new.file-type-page.header.description"
              defaultMessage={
                "Click a button to create a new file.  Documents can be simultaneously edited by multiple people, maintain a full <A>TimeTravel history</A> of edits, and support evaluation of code."
              }
              values={{
                A: (ch) => (
                  <A href="https://doc.cocalc.com/time-travel.html">{ch}</A>
                ),
              }}
            />
          </Paragraph>
          <FileTypeSelector
            create_file={submit}
            create_folder={createFolder}
            projectActions={actions}
            availableFeatures={availableFeatures}
            filename={filename}
            filenameChanged={filenameChanged}
            role="region"
            aria-label="File type selection"
          >
            <Tip
              title={"Download files from the Internet"}
              icon={"cloud"}
              placement={"bottom"}
              tip={`Paste a URL or GitHub repo in the input box above, then press enter or click here to download it into your project. ${blocked()}`}
            >
              <NewFileButton
                icon={"cloud"}
                name={`Download from Internet URL ${blocked()}`}
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
