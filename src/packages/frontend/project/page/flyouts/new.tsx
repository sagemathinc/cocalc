/*
 *  This file is part of CoCalc: Copyright © 2023 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { Button, Input, Space, Tag } from "antd";
import { join } from "path";

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
  Paragraph,
  SelectorInput,
  Text,
} from "@cocalc/frontend/components";
import ProgressEstimate from "@cocalc/frontend/components/progress-estimate";
import { FileTypeSelector } from "@cocalc/frontend/project/new";
import {
  NEW_FILETYPE_ICONS,
  isNewFiletypeIconName,
} from "@cocalc/frontend/project/new/consts";
import { useAvailableFeatures } from "@cocalc/frontend/project/use-available-features";
import { NewFilenameFamilies } from "@cocalc/frontend/project/utils";
import { DEFAULT_NEW_FILENAMES, NEW_FILENAMES } from "@cocalc/util/db-schema";
import { separate_file_extension } from "@cocalc/util/misc";
import { COLORS } from "@cocalc/util/theme";
import { ChatGPTGenerateNotebookButton } from "../home-page/chatgpt-generate-jupyter";

export function NewFlyout({
  project_id,
  wrap,
  defaultExt = "ipynb",
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
    const { name } = separate_file_extension(fullname);
    setFilename(name);
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

  async function createFile() {
    if (!filename) return;
    const name = `${filename}.${ext}`;
    try {
      setCreating(true);
      await actions?.create_file({
        name,
        ext,
        current_path,
      });
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
      : "file";
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

  function renderHead() {
    return (
      <Space style={{ padding: "10px" }} direction="vertical">
        <Paragraph>
          Create a new file in
          <code>
            <Icon name="home" />/{current_path}
          </code>
          .
        </Paragraph>
        <Input
          placeholder="Basename..."
          value={filename}
          onChange={onChangeHandler}
          onKeyUp={onKeyUpHandler}
          onFocus={inputOnFocus}
          style={{ width: "100%" }}
          addonBefore={fileIcon()}
          addonAfter={`.${ext}`}
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
            Create File
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
      <div style={{ width: "100%", overflowX: "hidden", padding: "5px" }}>
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
        <hr />
        <Tag color={COLORS.GRAY_L}>Name generator</Tag>
        <SelectorInput
          style={{ width: "100%", color: COLORS.GRAY }}
          selected={selected}
          options={NewFilenameFamilies}
          on_change={(family) => actions?.set_new_filename_family(family)}
        />
      </div>
    );
  }

  return (
    <>
      {renderHead()}
      {wrap(renderBody())}
    </>
  );
}
