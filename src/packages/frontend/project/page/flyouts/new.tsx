/*
 *  This file is part of CoCalc: Copyright © 2023 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { Button, Input, Space, Tag } from "antd";

import { default_filename } from "@cocalc/frontend/account";
import {
  React,
  useActions,
  useEffect,
  useState,
  useTypedRedux,
} from "@cocalc/frontend/app-framework";
import {
  ErrorDisplay,
  Icon,
  IconName,
  SelectorInput,
  Text,
} from "@cocalc/frontend/components";
import ProgressEstimate from "@cocalc/frontend/components/progress-estimate";
import { file_options } from "@cocalc/frontend/editor-tmp";
import { PathNavigator } from "@cocalc/frontend/project/explorer/path-navigator";
import { FileTypeSelector } from "@cocalc/frontend/project/new";
import {
  NEW_FILETYPE_ICONS,
  isNewFiletypeIconName,
} from "@cocalc/frontend/project/new/consts";
import { NewFileDropdown } from "@cocalc/frontend/project/new/new-file-dropdown";
import { useAvailableFeatures } from "@cocalc/frontend/project/use-available-features";
import { NewFilenameFamilies } from "@cocalc/frontend/project/utils";
import { DEFAULT_NEW_FILENAMES, NEW_FILENAMES } from "@cocalc/util/db-schema";
import { separate_file_extension } from "@cocalc/util/misc";
import { COLORS } from "@cocalc/util/theme";
import { ChatGPTGenerateNotebookButton } from "../home-page/chatgpt-generate-jupyter";

const DEFAULT_EXT = "ipynb";

export function NewFlyout({
  project_id,
  wrap,
  defaultExt = DEFAULT_EXT,
}: {
  project_id: string;
  wrap: Function;
  defaultExt?: string;
}): JSX.Element {
  const other_settings = useTypedRedux("account", "other_settings");
  const rfn = other_settings.get(NEW_FILENAMES);
  const selected = rfn ?? DEFAULT_NEW_FILENAMES;
  const actions = useActions({ project_id });
  const current_path = useTypedRedux({ project_id }, "current_path");
  const availableFeatures = useAvailableFeatures(project_id);
  const file_creation_error = useTypedRedux(
    { project_id },
    "file_creation_error"
  );

  const [filename, setFilename] = useState<string>("");
  const [ext, setExt] = useState<string>(defaultExt);
  const [manual, setManual] = useState<boolean>(false);
  const [creating, setCreating] = useState<boolean>(false);

  function makeNewFilename() {
    const fullname = default_filename(ext, project_id);
    if (ext != "/") {
      const { name } = separate_file_extension(fullname);
      setFilename(name);
    } else {
      setFilename(`${fullname.slice(0, fullname.length - 2)}/`);
    }
  }

  useEffect(() => {
    if (!filename) {
      makeNewFilename();
    }
  }, []);

  useEffect(() => {
    if (!manual) {
      makeNewFilename();
    }
  }, [ext, manual, selected]);

  const isFile = !(filename && filename.endsWith("/"));

  // if name is entered manual and contains an extension, set the ext to it
  useEffect(() => {
    if (manual) {
      if (isFile) {
        const { ext: newExt } = separate_file_extension(filename);
        if (newExt) {
          setExt(newExt);
        } else {
          setExt(DEFAULT_EXT);
        }
      } else {
        setExt("/");
      }
    }
  }, [filename, manual]);

  async function createFile() {
    if (!filename) return;
    const name = isFile ? `${filename}.${ext}` : `${filename}/`;
    try {
      setCreating(true);
      if (isFile) {
        await actions?.create_file({
          name,
          ext,
          current_path,
        });
      } else {
        await actions?.create_folder({
          name,
          current_path,
        });
      }
      setManual(false);
      makeNewFilename();
    } finally {
      setCreating(false);
    }
  }

  function onKeyUpHandler(e) {
    switch (e.key) {
      case "Enter":
        createFile();
        break;
      case "Escape":
        setFilename("");
        break;
    }
  }

  function onChangeHandler(e: React.ChangeEvent<HTMLInputElement>) {
    const val = e.target.value;
    if (val) {
      setManual(true);
      setFilename(val);
    } else {
      setManual(false);
      setFilename("");
    }
  }

  function fileIcon() {
    const name: IconName = isNewFiletypeIconName(ext)
      ? NEW_FILETYPE_ICONS[ext!]
      : file_options(`foo.${ext}`)?.icon ?? "file";
    return <Icon name={name} style={{ fontSize: "150%" }} />;
  }

  function selectType(nextExt?: string) {
    if (ext === nextExt) {
      createFile();
    } else {
      setExt(nextExt ?? "");
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
        style={{ marginBottom: "20px" }}
        error={message}
        onClose={(): void => {
          actions?.setState({ file_creation_error: "" });
        }}
      />
    );
  }

  function inputOnFocus(e: React.FocusEvent<HTMLInputElement>) {
    e.target.select();
  }

  function renderExtAddon(): JSX.Element {
    return (
      <NewFileDropdown
        mode="flyout"
        create_file={(ext) => ext && ext}
        title={`.${ext}`}
        hide_down={true}
        button={false}
      />
    );
  }

  function renderHead() {
    return (
      <Space style={{ padding: "10px" }} direction="vertical">
        <Space direction="horizontal">
          Location:{" "}
          <PathNavigator
            mode={"flyout"}
            project_id={project_id}
            className={"cc-project-flyout-path-navigator"}
          />
        </Space>
        <Input
          placeholder="Basename..."
          value={filename}
          onChange={onChangeHandler}
          onKeyUp={onKeyUpHandler}
          onFocus={inputOnFocus}
          style={{ width: "100%" }}
          addonBefore={fileIcon()}
          addonAfter={renderExtAddon()}
        />
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            marginBottom: "10px",
            justifyContent: "space-between",
          }}
        >
          {creating && <ProgressEstimate seconds={5} />}
          <Button
            style={{ flex: "1 0 auto" }}
            type="primary"
            disabled={creating || !filename || !ext}
            onClick={createFile}
          >
            Create {isFile ? "File" : "Folder"}
          </Button>
          <Text type="secondary" style={{ textAlign: "center" }}>
            (or click the type button twice)
          </Text>
        </div>
      </Space>
    );
  }

  function renderBody() {
    return (
      <Space
        style={{ width: "100%", overflowX: "hidden", padding: "5px" }}
        direction="vertical"
      >
        {file_creation_error && renderError()}
        <FileTypeSelector
          mode="flyout"
          selectedExt={ext}
          projectActions={actions}
          create_file={selectType}
          availableFeatures={availableFeatures}
          chatgptNotebook={
            <ChatGPTGenerateNotebookButton
              project_id={project_id}
              style={{ width: "100%" }}
            />
          }
        />
        <Tag color={COLORS.ANTD_ORANGE}>More file types</Tag>
        <NewFileDropdown mode="flyout" create_file={selectType} />
        <hr />
        <Tag color={COLORS.GRAY_L}>Name generator</Tag>
        <SelectorInput
          style={{ width: "100%", color: COLORS.GRAY }}
          selected={selected}
          options={NewFilenameFamilies}
          on_change={(family) => actions?.set_new_filename_family(family)}
        />
      </Space>
    );
  }

  return (
    <>
      {renderHead()}
      {wrap(renderBody())}
    </>
  );
}
