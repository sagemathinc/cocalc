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
  useMemo,
  useState,
  useTypedRedux,
} from "@cocalc/frontend/app-framework";
import {
  ErrorDisplay,
  Icon,
  IconName,
  SelectorInput,
  Tip,
} from "@cocalc/frontend/components";
import ProgressEstimate from "@cocalc/frontend/components/progress-estimate";
import { file_options } from "@cocalc/frontend/editor-tmp";
import { DELAY_SHOW_MS } from "@cocalc/frontend/project//new/consts";
import { PathNavigator } from "@cocalc/frontend/project/explorer/path-navigator";
import { FileTypeSelector } from "@cocalc/frontend/project/new";
import {
  NEW_FILETYPE_ICONS,
  isNewFiletypeIconName,
} from "@cocalc/frontend/project/new/consts";
import { NewFileButton } from "@cocalc/frontend/project/new/new-file-button";
import { NewFileDropdown } from "@cocalc/frontend/project/new/new-file-dropdown";
import { useAvailableFeatures } from "@cocalc/frontend/project/use-available-features";
import { NewFilenameFamilies } from "@cocalc/frontend/project/utils";
import { DEFAULT_NEW_FILENAMES, NEW_FILENAMES } from "@cocalc/util/db-schema";
import { separate_file_extension, trunc_middle } from "@cocalc/util/misc";
import { COLORS } from "@cocalc/util/theme";
import { FIX_BORDER } from "../common";
import { DEFAULT_EXT, FLYOUT_PADDING } from "./consts";

function getFileExtension(filename: string): string | null {
  if (filename.endsWith(" ")) {
    return null;
  }
  return separate_file_extension(filename).ext;
}

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
    "file_creation_error",
  );

  const [filename, setFilename] = useState<string>("");
  const [ext, setExt] = useState<string>(defaultExt);
  const [manualExt, setManualExt] = useState<boolean>(false);
  const [manual, setManual] = useState<boolean>(false);
  const [creating, setCreating] = useState<boolean>(false);

  // generate a new filename on demand, depends on the selected extension, etc.
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

  const isFile = useMemo(
    () => !(filename && filename.endsWith("/")),
    [filename],
  );

  // if name is entered manual and contains an extension, set the ext to it
  useEffect(() => {
    if (manual && filename.includes(".")) {
      if (isFile) {
        const newExt = getFileExtension(filename);
        if (newExt == null) {
          setExt("");
          setManualExt(true);
        } else {
          setExt(newExt);
          setManualExt(true);
        }
      } else {
        setExt("/");
        setManualExt(true);
      }
    } else {
      setManualExt(false);
    }
  }, [filename, manual]);

  // used to compute the filename to create, based on the current state
  function genNewFilename(): string {
    if (isFile) {
      if (manualExt) {
        // extension is typed in explicitly
        return filename;
      } else {
        if (ext === "") {
          if (manualExt && filename.endsWith(" ")) {
            // if we trigger the "no extension" with a space, trim the name
            // otherwise, use the no extension creation button
            return filename.trim();
          } else {
            return filename;
          }
        } else {
          return `${filename}.${ext}`;
        }
      }
    } else {
      if (filename.endsWith("/")) {
        return filename;
      } else {
        return `${filename}/`;
      }
    }
  }
  const newFilename = useMemo(
    () => genNewFilename(),
    [isFile, filename, ext, manualExt, manual],
  );

  async function createFile() {
    if (!filename) return;
    try {
      setCreating(true);
      if (isFile) {
        await actions?.create_file({
          name: newFilename.trim(),
          ext: ext.trim(),
          current_path,
        });
      } else {
        await actions?.create_folder({
          name: newFilename.trim(),
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
    return (
      <Icon
        name={name}
        style={{ fontSize: "150%", marginRight: FLYOUT_PADDING }}
      />
    );
  }

  function selectType(nextExt?: string) {
    if (ext === nextExt) {
      createFile();
    } else {
      // if we had a "/" at the end and now we don't, remove it from the base filename
      if (nextExt !== "/") {
        const nextName = filename.endsWith("/")
          ? filename.slice(0, filename.length - 1)
          : filename;
        // if there is an extension in the filename, remove it
        const { ext: oldExt, name } = separate_file_extension(nextName);
        if (oldExt !== nextExt || nextExt === "") {
          setFilename(name);
        }
      } else if (nextExt === "/" && !filename.endsWith("/")) {
        setFilename(`${filename}/`);
      }
      // set the new extension
      setExt(nextExt ?? "");
      // since we pressed a file-type button, we switch back to the automatic extension regime
      setManualExt(false);
    }
  }

  function getRenderErrorMessage() {
    const error = file_creation_error;
    if (error === "not running") {
      return "The project is not running. Please try again in a moment";
    } else {
      return error;
    }
  }

  function renderError() {
    return (
      <ErrorDisplay
        style={{ margin: 0, flex: "1 0 auto" }}
        banner={true}
        error={getRenderErrorMessage()}
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
    const title = ext === "/" ? `/` : ext === "" ? "" : `.${ext}`;
    return (
      <NewFileDropdown
        mode="flyout"
        create_file={(ext) => {
          if (filename.includes(".")) {
            // have explicit extension in name, but just changed it
            // via dropdown, so better remove it from the name.
            setFilename(separate_file_extension(filename).name);
          }
          setExt(ext ?? "");
        }}
        title={title}
        button={false}
      />
    );
  }

  function renderCreateFileButton() {
    const { name, ext } = separate_file_extension(newFilename);
    return (
      <Button
        type="primary"
        disabled={creating || !filename}
        onClick={createFile}
        block
      >
        <span style={{ whiteSpaceCollapse: "preserve" } as any}>
          <span>Create</span>{" "}
          <span style={{ fontWeight: "bold", color: "white" }}>
            {trunc_middle(name, 30)}
          </span>
          {isFile && ext ? `.${ext}` : ""}
        </span>
      </Button>
    );
  }

  function renderHead() {
    const padding = { padding: FLYOUT_PADDING };
    return (
      <Space direction="vertical">
        <Space direction="horizontal" style={padding}>
          Location:{" "}
          <PathNavigator
            mode={"flyout"}
            project_id={project_id}
            className={"cc-project-flyout-path-navigator"}
          />
        </Space>
        <Input
          allowClear
          placeholder="Basename..."
          value={filename}
          onChange={onChangeHandler}
          onKeyUp={onKeyUpHandler}
          onFocus={inputOnFocus}
          style={{ width: "100%", ...padding }}
          addonBefore={fileIcon()}
          addonAfter={renderExtAddon()}
        />
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            ...padding,
          }}
        >
          {renderCreateFileButton()}
          {creating && <ProgressEstimate seconds={5} />}
        </div>
        {file_creation_error && renderError()}
      </Space>
    );
  }

  function renderBody() {
    return (
      <Space
        style={{ width: "100%", overflowX: "hidden", padding: FLYOUT_PADDING }}
        direction="vertical"
      >
        <FileTypeSelector
          mode="flyout"
          selectedExt={ext}
          projectActions={actions}
          create_file={selectType}
          availableFeatures={availableFeatures}
          filename={filename}
          makeNewFilename={makeNewFilename}
        />
        <Tag color={COLORS.ANTD_ORANGE}>Additional types</Tag>
        <Tip
          delayShow={DELAY_SHOW_MS}
          title="Directory"
          icon={"folder"}
          tip="Create a subdirectory in the current directory. You can also click the file type dropdown after the filename."
        >
          <NewFileButton
            name="Directory"
            on_click={selectType}
            ext="/"
            size="small"
            active={ext === "/"}
          />
        </Tip>
        <Tip
          delayShow={DELAY_SHOW_MS}
          title="No file extension"
          icon={"file"}
          tip=<>
            Create a file without a file extension, for example a{" "}
            <code>Makefile</code>. You can also type{" "}
            <code>filename.[space]</code>, then backspace twice.
          </>
        >
          <NewFileButton
            name="Create file - no extension"
            on_click={selectType}
            ext=""
            size="small"
            active={ext === ""}
          />
        </Tip>
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

  function renderBottom(): JSX.Element {
    return (
      <Space
        style={{
          flex: "1 0 auto",
          width: "100%",
          overflowX: "hidden",
          overflowY: "hidden",
          padding: FLYOUT_PADDING,
          borderTop: FIX_BORDER,
        }}
        direction="vertical"
      >
        {renderCreateFileButton()}
      </Space>
    );
  }

  return (
    <>
      {renderHead()}
      {wrap(renderBody())}
      {renderBottom()}
    </>
  );
}
