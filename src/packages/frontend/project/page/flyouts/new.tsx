/*
 *  This file is part of CoCalc: Copyright © 2023 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Button, Flex, Input, Space, Tag } from "antd";
import { FormattedMessage, useIntl } from "react-intl";

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
  HelpIcon,
  Icon,
  IconName,
  Paragraph,
  SelectorInput,
  Tip,
} from "@cocalc/frontend/components";
import ProgressEstimate from "@cocalc/frontend/components/progress-estimate";
import ComputeServer from "@cocalc/frontend/compute/inline";
import { file_options } from "@cocalc/frontend/editor-tmp";
import { labels } from "@cocalc/frontend/i18n";
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
  if (filename.endsWith(".")) {
    return null; // null signals no extension
  }
  return separate_file_extension(filename).ext;
}

function isFile(fn: string) {
  return !(fn && fn.endsWith("/"));
}

export function NewFlyout({
  project_id,
  wrap,
  defaultExt = DEFAULT_EXT,
}: {
  project_id: string;
  wrap: Function;
  defaultExt?: string;
}): React.JSX.Element {
  const intl = useIntl();
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
  const compute_server_id = useTypedRedux({ project_id }, "compute_server_id");

  // the controlled value in the filename/basename input box
  const [filename, setFilename] = useState<string>("");
  // once the user starts fiddling around in that box, we switch to manually generated filenames
  const [manual, setManual] = useState<boolean>(false);
  // we set this to the default to visually highlight the button
  const [ext, setExt] = useState<string>(defaultExt);
  // if this is true, the entered filename contains a ".ext"
  const [manualExt, setManualExt] = useState<boolean>(false);
  // if true, creating a file is currently in progress
  const [creating, setCreating] = useState<boolean>(false);

  // generate a new filename on demand, depends on the selected extension, existing files in the current directory, etc.
  function getNewFilename(ext: string): string {
    if (ext != "/") {
      const fullname = manual
        ? `${filename}.${ext}`
        : default_filename(ext, project_id);
      const { name } = separate_file_extension(fullname);
      return name;
    } else {
      return manual ? `${filename}/` : default_filename("/", project_id);
    }
  }

  // if name is entered manually and contains an extension, set the ext to it
  useEffect(() => {
    if (manual) {
      if (filename.endsWith("/")) {
        setExt("/");
      } else {
        if (filename.includes(".")) {
          setManualExt(true);
          const newExt = getFileExtension(filename);
          if (newExt == null) {
            setExt("");
          } else {
            setExt(newExt);
          }
        } else {
          // directory mode → escape back to no extension
          if (ext === "/") {
            setExt("");
          }
        }
      }
    } else {
      setManualExt(false);
    }
  }, [filename, manual]);

  // used to compute the filename to create, based on the current state
  function genNewFilename(): string {
    if (filename === "") return "";
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

  async function createFile(fn: string) {
    if (!fn) return; // do nothing for an empty string
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
        await actions?.createFolder({
          name: newFilename.trim(),
          current_path,
        });
      }
      // success: reset the manual flag
      setManual(false);
      // and reset the filename and extension to the defaults
      setFilename("");
    } finally {
      // upon error, we keep the state as is, so the user can retry
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

  function handleOnClick(nextExt: string) {
    let fn = getNewFilename(nextExt);
    if (nextExt !== "/") {
      // if we had a "/" at the end and now we don't, remove it from the base filename
      fn = fn.endsWith("/") ? fn.slice(0, fn.length - 1) : fn;
      // if there is an extension in the filename, replace it with the new one
      const { ext: oldExt, name } = separate_file_extension(fn);
      if (oldExt !== nextExt) {
        if (nextExt === "") {
          fn = name; // we avoid appending a silly dot
        } else {
          fn = `${name}.${nextExt}`;
        }
      }
    } else if (nextExt === "/" && !fn.endsWith("/")) {
      fn = `${fn}/`;
    }
    // set the new extension
    setExt(nextExt);
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
    if (manualExt) {
      // have explicit extension in name, but just changed it
      // via dropdown, so better remove it from the name.
      const { name } = separate_file_extension(filename);
      setFilename(name);
      setManualExt(false);
    } else {
      const fn = getNewFilename(nextExt);
      setFilename(fn);
    }
    setExt(nextExt);
  }

  function renderExtAddon(): React.JSX.Element {
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
    const newFilename = genNewFilename();
    const { name, ext } = separate_file_extension(newFilename);
    const renderedExt =
      name && ext && isFile(newFilename) && ext !== "/" ? `.${ext}` : "";
    const disabled = creating || !name || name === "/";
    return (
      <Flex dir="horizontal">
        <Button
          type="primary"
          disabled={disabled}
          onClick={() => createFile(newFilename)}
          block
          style={{ flex: "1" }}
        >
          <span style={{ whiteSpaceCollapse: "preserve" } as any}>
            <span>
              <FormattedMessage
                id="project.page.flyouts.new.create.label"
                defaultMessage={"Create"}
                description={
                  "Create a file with the given name in a file-system"
                }
              />
            </span>{" "}
            <span
              style={{
                fontWeight: "bold",
                color: disabled ? undefined : "white",
              }}
            >
              {trunc_middle(name, 30)}
            </span>
            {renderedExt}
          </span>
        </Button>
        <HelpIcon
          title={intl.formatMessage({
            id: "project.page.flyouts.new.create.help.title",
            defaultMessage: "Creating files and folders",
          })}
          style={{
            flex: "0 1 auto",
            padding: FLYOUT_PADDING,
            fontSize: "18px",
          }}
        >
          <FormattedMessage
            id="project.page.flyouts.new.create.help.message"
            description={
              "Help information about creating a file in a file-system"
            }
            defaultMessage={`
              <Paragraph>
                The filename is optional. If you don't specify one, a default name
                will be create for you. You can either select the type explicitly in
                the dropdown above, or click on one of the buttons below. These
                buttons will create the file or folder immediately.
              </Paragraph>
              <Paragraph>
                New folders (directories) are created by typing in the name and
                clicking on "Folder" below or by adding a "/" at the end of the
                name. Such a forward-slash is used to indicate directories on Linux
                – that's the underlying operating system.
              </Paragraph>
              <Paragraph>
                You can also just type in the filename with the extension and press Enter to create the file.
              </Paragraph>
          `}
            values={{ Paragraph: (c) => <Paragraph>{c}</Paragraph> }}
          />
        </HelpIcon>
      </Flex>
    );
  }

  function renderHead() {
    const padding = { padding: FLYOUT_PADDING };
    return (
      <Space direction="vertical">
        <Space direction="horizontal" style={padding}>
          <FormattedMessage
            id="project.page.flyouts.new.header_location"
            defaultMessage={"Location:"}
            description={"The directory location of files in a file-system"}
          />{" "}
          <PathNavigator
            mode={"flyout"}
            project_id={project_id}
            className={"cc-project-flyout-path-navigator"}
          />
        </Space>
        {!!compute_server_id && (
          <div style={padding}>
            on <ComputeServer id={compute_server_id} />
          </div>
        )}
        <Input
          allowClear
          placeholder={intl.formatMessage({
            id: "project.page.flyouts.new.filename.placeholder",
            defaultMessage: "Filename (optional)",
          })}
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
          filenameChanged={manual}
          makeNewFilename={(ext: string) => setFilename(getNewFilename(ext))}
        />
        <Tag color={COLORS.ANTD_ORANGE}>Additional types</Tag>
        <Tip
          delayShow={DELAY_SHOW_MS}
          title="Folder (directory)"
          icon={"folder"}
          tip={intl.formatMessage({
            id: "project.page.flyouts.new.folder.tooltip",
            defaultMessage:
              "Creating a subdirectory in the current directory instead of a file.",
            description: "A folder in a file-system",
          })}
        >
          <NewFileButton
            name={intl.formatMessage(labels.folder)}
            on_click={handleOnClick}
            ext="/"
            size="small"
            active={ext === "/"}
          />
        </Tip>
        <Tip
          delayShow={DELAY_SHOW_MS}
          title={intl.formatMessage({
            id: "project.page.flyouts.new.filename_without_ext.title",
            defaultMessage: "No file extension",
            description: "File without an extension in a file-system",
          })}
          icon={"file"}
          tip={intl.formatMessage({
            id: "project.page.flyouts.new.filename_without_ext.tooltip",
            defaultMessage: `Create a file without a file extension,
              for example a <code>Makefile</code>.
              You can also type <code>filename.[space]</code> and backspace once.`,
          })}
        >
          <NewFileButton
            name={intl.formatMessage({
              id: "project.page.flyouts.new.filename_without_ext.label",
              defaultMessage: "Create file - no extension",
              description: "File without an extension in a file-system",
            })}
            on_click={handleOnClick}
            ext=""
            size="small"
            active={ext === ""}
          />
        </Tip>
        <NewFileDropdown mode="flyout" create_file={handleOnClick} />
        <hr />
        <Tag color={COLORS.GRAY_L}>Filename generator</Tag>
        <SelectorInput
          style={{ width: "100%", color: COLORS.GRAY }}
          selected={selected}
          options={NewFilenameFamilies}
          on_change={(family) => actions?.set_new_filename_family(family)}
        />
      </Space>
    );
  }

  function renderBottom(): React.JSX.Element {
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
