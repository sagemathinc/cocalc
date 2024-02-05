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

  const filename0 = useTypedRedux({ project_id }, "default_filename");
  const [filename, setFilename] = useState<string>(() => {
    if (filename0) {
      return separate_file_extension(filename0 ?? "").name ?? "";
    }
    return "";
  });
  const [ext, setExt] = useState<string>(() => {
    if (filename0) {
      const ext = getFileExtension(filename0);
      return ext ? ext : defaultExt;
    }
    return defaultExt;
  });
  const [manualExt, setManualExt] = useState<boolean>(false);
  const [manual, setManual] = useState<boolean>(false);
  const [creating, setCreating] = useState<boolean>(false);

  // generate a new filename on demand, depends on the selected extension, etc.
  function getNewFilename(nextExt?: string): string {
    if ((nextExt ?? ext) != "/") {
      const fullname = manual
        ? `${filename}.${nextExt}`
        : default_filename(nextExt ?? ext, project_id);
      const { name } = separate_file_extension(fullname);
      return name;
    } else {
      return manual ? `${filename}/` : default_filename("/", project_id);
    }
  }

  useEffect(() => {
    if (!filename) {
      setFilename(getNewFilename());
    }
  }, []);

  function isFile(fn?: string) {
    fn ??= filename;
    return !(fn && fn.endsWith("/"));
  }

  // if name is entered manual and contains an extension, set the ext to it
  useEffect(() => {
    if (manual && filename.includes(".")) {
      if (isFile()) {
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
    if (isFile(filename) && ext !== "/") {
      if (manualExt) {
        // extension is typed in explicitly
        return filename;
      } else {
        if (ext === "") {
          if (filename.endsWith(" ")) {
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

  async function createFile(fn: string) {
    if (!fn) return;
    const { name: newFilename, ext } = separate_file_extension(fn);

    try {
      setCreating(true);
      if (isFile(fn)) {
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
      // reset the filename to a new default
      setFilename(getNewFilename(ext));
    } finally {
      setCreating(false);
    }
  }

  function onKeyUpHandler(e) {
    switch (e.key) {
      case "Enter":
        createFile(manualExt ? filename : `${filename}.${ext}`);
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

  function handleOnClick(nextExt?: string) {
    let fn = getNewFilename(nextExt);
    if (nextExt !== "/") {
      // if we had a "/" at the end and now we don't, remove it from the base filename
      fn = fn.endsWith("/") ? fn.slice(0, fn.length - 1) : fn;
      // if there is an extension in the filename, replace it with the new one
      const { ext: oldExt, name } = separate_file_extension(fn);
      if (oldExt !== nextExt || nextExt === "") {
        fn = `${name}.${nextExt}`;
      }
    } else if (nextExt === "/" && !fn.endsWith("/")) {
      fn = `${fn}/`;
    }
    // set the new extension
    setExt(nextExt ?? "");
    createFile(fn);
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

  function handleNewExtDropdown(ext: string) {
    const nextExt = ext ?? "";
    if (filename.includes(".")) {
      // have explicit extension in name, but just changed it
      // via dropdown, so better remove it from the name.
      const { name } = separate_file_extension(filename);
      setFilename(name);
    } else {
      setFilename(getNewFilename(nextExt));
    }
    setExt(nextExt);
  }

  function renderExtAddon(): JSX.Element {
    const title = ext === "/" ? `/` : ext === "" ? "" : `.${ext}`;
    return (
      <NewFileDropdown
        mode="flyout"
        create_file={handleNewExtDropdown}
        title={title}
        showDown
        button={false}
        cacheKey={`${manual}-${manualExt}-${filename}-${ext}`}
      />
    );
  }

  function renderCreateFileButton() {
    const { name, ext } = separate_file_extension(newFilename);
    return (
      <Button
        type="primary"
        disabled={creating || !filename}
        onClick={() => createFile(newFilename)}
        block
      >
        <span style={{ whiteSpaceCollapse: "preserve" } as any}>
          <span>Create</span>{" "}
          <span style={{ fontWeight: "bold", color: "white" }}>
            {trunc_middle(name, 30)}
          </span>
          {ext && isFile(newFilename) && ext !== "/" ? `.${ext}` : ""}
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
          create_file={handleOnClick}
          availableFeatures={availableFeatures}
          filename={filename}
          makeNewFilename={() => setFilename(getNewFilename())}
        />
        <Tag color={COLORS.ANTD_ORANGE}>Additional types</Tag>
        <Tip
          delayShow={DELAY_SHOW_MS}
          title="Directory"
          icon={"folder"}
          tip="Switch to creating a subdirectory in the current directory instead of a file."
        >
          <NewFileButton
            name="Directory"
            on_click={handleOnClick}
            ext="/"
            size="small"
            active={ext === "/"}
          />
        </Tip>
        <Tip
          delayShow={DELAY_SHOW_MS}
          title="No file extension"
          icon={"file"}
          tip={
            <>
              Create a file without a file extension, for example a{" "}
              <code>Makefile</code>. You can also type{" "}
              <code>filename.[space]</code>, then backspace twice.
            </>
          }
        >
          <NewFileButton
            name="Create file - no extension"
            on_click={handleOnClick}
            ext=""
            size="small"
            active={ext === ""}
          />
        </Tip>
        <NewFileDropdown mode="flyout" create_file={handleOnClick} />
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
