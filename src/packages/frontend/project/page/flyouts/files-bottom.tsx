/*
 *  This file is part of CoCalc: Copyright © 2023 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { CaretRightOutlined } from "@ant-design/icons";
import { Button, Collapse, CollapseProps, Space, Tooltip } from "antd";
import immutable from "immutable";
import { debounce } from "lodash";

import { Button as BSButton } from "@cocalc/frontend/antd-bootstrap";
import {
  CSS,
  useActions,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useTypedRedux,
} from "@cocalc/frontend/app-framework";
import { ConnectionStatus } from "@cocalc/frontend/app/store";
import { Icon } from "@cocalc/frontend/components";
import { useStudentProjectFunctionality } from "@cocalc/frontend/course";
import { file_options } from "@cocalc/frontend/editor-tmp";
import { ConnectionStatusIcon } from "@cocalc/frontend/frame-editors/frame-tree/title-bar";
import { open_new_tab } from "@cocalc/frontend/misc";
import { VIEWABLE_FILE_EXT } from "@cocalc/frontend/project/explorer/file-listing/file-row";
import {
  DirectoryListing,
  DirectoryListingEntry,
} from "@cocalc/frontend/project/explorer/types";
import { url_href } from "@cocalc/frontend/project/utils";
import {
  filename_extension,
  human_readable_size,
  path_to_file,
  plural,
  trunc_middle,
} from "@cocalc/util/misc";
import { COLORS } from "@cocalc/util/theme";
import { FIX_BORDER } from "../common";
import { FLYOUT_PADDING, PANEL_STYLE_BOTTOM, PanelKey } from "./consts";
import { FilesSelectedControls } from "./files-controls";
import { TerminalFlyout } from "./files-terminal";
import { getFlyoutFiles, storeFlyoutState } from "./state";
import { useSingleFile } from "./utils";
import { FilesSelectButtons } from "./files-select-extra";

interface FilesBottomProps {
  project_id: string;
  checked_files: immutable.Set<string>;
  activeFile: DirectoryListingEntry | null;
  directoryFiles: DirectoryListing;
  projectIsRunning?: boolean;
  rootHeightPx: number;
  open: (
    e: React.MouseEvent | React.KeyboardEvent,
    index: number,
    skip?: boolean,
  ) => void;
  showFileSharingDialog(file): void;
  modeState: ["open" | "select", (mode: "open" | "select") => void];
  clearAllSelections: (switchMode: boolean) => void;
  selectAllFiles: () => void;
  getFile: (path: string) => DirectoryListingEntry | undefined;
  publicFiles: Set<string>;
}

export function FilesBottom({
  project_id,
  checked_files,
  activeFile,
  modeState,
  projectIsRunning,
  clearAllSelections,
  selectAllFiles,
  rootHeightPx,
  open,
  showFileSharingDialog,
  getFile,
  directoryFiles,
  publicFiles,
}: FilesBottomProps) {
  const [mode, setMode] = modeState;
  const current_path = useTypedRedux({ project_id }, "current_path");
  const actions = useActions({ project_id });
  const [activeKeys, setActiveKeys] = useState<PanelKey[]>([]);
  const [resize, setResize] = useState<number>(0);
  const student_project_functionality =
    useStudentProjectFunctionality(project_id);
  const [connectionStatus, setConectionStatus] = useState<
    ConnectionStatus | ""
  >("");
  const [terminalFontSize, setTerminalFontSizeValue] = useState<number>(11);
  const [terminalTitle, setTerminalTitle] = useState<string>("");
  const [syncPath, setSyncPath] = useState<number>(0);
  const [sync, setSync] = useState<boolean>(true);

  const collapseRef = useRef<HTMLDivElement>(null);

  const triggerResize = debounce(() => setResize((r) => r + 1), 50, {
    leading: false,
    trailing: true,
  });

  function setTerminalFontSize(next: number | Function) {
    const sani = (val) => Math.round(Math.min(18, Math.max(6, val)));
    if (typeof next === "number") {
      setTerminalFontSizeValue(sani(next));
    } else {
      setTerminalFontSizeValue((s) => sani(next(s)));
    }
  }

  useEffect(() => {
    const state = getFlyoutFiles(project_id);
    // once upon mounting, expand the collapse panels if they were open
    const next: PanelKey[] = [];
    if (state.selected?.show === true) {
      next.push("selected");
    }
    if (state.terminal?.show === true) {
      next.push("terminal");
    }
    setActiveKeys([...next, ...activeKeys]);
  }, []);

  // useEffect(() => {
  //   // if any selected and nothing in state, open "selected".
  //   // this is to teach users this can be expanded.
  //   if (
  //     checked_files.size > 0 &&
  //     getFlyoutFiles(project_id).selected?.show == null
  //   ) {
  //     setActiveKeys(["selected", ...activeKeys]);
  //   }
  // }, [checked_files]);

  // useEffect(() => {
  //   if (mode === "select") {
  //     // expand the select panel if it was closed
  //     if (!activeKeys.includes("selected")) {
  //       setActiveKeys(["selected", ...activeKeys]);
  //     }
  //   }
  // }, [mode]);

  const singleFile = useSingleFile({
    checked_files,
    activeFile,
    getFile,
    directoryFiles,
  });

  // if rootRef changes size, increase resize
  useLayoutEffect(() => {
    if (collapseRef.current == null) return;
    const observer = new ResizeObserver(triggerResize);
    observer.observe(collapseRef.current);
    return () => observer.disconnect();
  }, [collapseRef.current]);

  function renderTerminal() {
    if (projectIsRunning === false) {
      return (
        <div style={{ padding: FLYOUT_PADDING }}>
          You have to start the project to be able to run a terminal.
        </div>
      );
    }
    const heightPx = `${0.33 * rootHeightPx}px`;
    return (
      <TerminalFlyout
        project_id={project_id}
        font_size={terminalFontSize}
        resize={resize}
        is_visible={activeKeys.includes("terminal")}
        setConectionStatus={setConectionStatus}
        heightPx={heightPx}
        setTerminalFontSize={setTerminalFontSize}
        setTerminalTitle={setTerminalTitle}
        syncPath={syncPath}
        sync={sync}
      />
    );
  }

  function renderDownloadView() {
    if (!singleFile) return;
    const { name, isDir, size = 0 } = singleFile;
    if (isDir) return;
    const full_path = path_to_file(current_path, name);
    const ext = (filename_extension(name) ?? "").toLowerCase();
    const showView = VIEWABLE_FILE_EXT.includes(ext);
    // the "href" part makes the link right-click copyable
    const url = url_href(project_id, full_path);
    const showDownload = !student_project_functionality.disableActions;
    const sizeStr = human_readable_size(size);

    if (!showDownload && !showView) return null;

    return (
      <Space.Compact size="small">
        {showDownload ? (
          <Tooltip
            title={
              <>
                <Icon name="cloud-download" /> Download this {sizeStr} file
                <br />
                to your own computer.
              </>
            }
          >
            <Button
              size="small"
              href={url}
              onClick={(e) => {
                e.stopPropagation();
                e.preventDefault();
                actions?.download_file({
                  path: full_path,
                  log: true,
                });
              }}
              icon={<Icon name="cloud-download" />}
            />
          </Tooltip>
        ) : undefined}
        {showView ? (
          <Tooltip title="View file in new tab">
            <Button
              size="small"
              href={url}
              onClick={(e) => {
                e.stopPropagation();
                e.preventDefault();
                open_new_tab(url);
              }}
              icon={<Icon name="eye" />}
            />
          </Tooltip>
        ) : undefined}
      </Space.Compact>
    );
  }

  function renderSelectExtra() {
    return (
      <Space size="small" direction="horizontal" wrap>
        {singleFile != null ? renderDownloadView() : undefined}
        <FilesSelectButtons
          setMode={setMode}
          checked_files={checked_files}
          mode={mode}
          selectAllFiles={selectAllFiles}
          clearAllSelections={clearAllSelections}
        />
      </Space>
    );
  }

  function renderSelectedControls() {
    return (
      <FilesSelectedControls
        project_id={project_id}
        checked_files={checked_files}
        directoryFiles={directoryFiles}
        open={open}
        showFileSharingDialog={showFileSharingDialog}
        getFile={getFile}
        mode="bottom"
        activeFile={activeFile}
        publicFiles={publicFiles}
      />
    );
  }

  function renderSelected() {
    if (checked_files.size === 0) {
      let totSize = 0;
      for (const f of directoryFiles) {
        if (!f.isDir) totSize += f.size ?? 0;
      }
      return (
        <div style={PANEL_STYLE_BOTTOM}>
          No files selected. Total size {human_readable_size(totSize)}.
        </div>
      );
    } else {
      return renderSelectedControls();
    }
  }

  function renderSelectedHeader() {
    if (checked_files.size === 0) {
      let [nFiles, nDirs] = [0, 0];
      for (const f of directoryFiles) {
        if (f.isDir) {
          nDirs++;
        } else {
          nFiles++;
        }
      }

      return (
        <>
          <Icon name="files" /> {nFiles} {plural(nFiles, "file")}, {nDirs}{" "}
          {plural(nDirs, "folder")}
        </>
      );
    } else if (singleFile) {
      const name = singleFile.name;
      const iconName = singleFile.isDir
        ? "folder"
        : (file_options(name)?.icon ?? "file");
      return (
        <div style={{ whiteSpace: "nowrap" }} title={name}>
          <Icon name={iconName} /> {trunc_middle(name, 20)}
        </div>
      );
    } else if (checked_files.size > 1) {
      return (
        <>
          <Icon name="files" /> {checked_files.size}{" "}
          {plural(checked_files.size, "file")} selected
        </>
      );
    }
  }

  function terminalHeader() {
    const title = connectionStatus === "connected" ? terminalTitle : "Terminal";
    return (
      <span style={{ whiteSpace: "nowrap" }} title={title}>
        <Icon name="terminal" /> {trunc_middle(title, 15)}
      </span>
    );
  }

  function renderTerminalExtra() {
    const shown = activeKeys.includes("terminal");
    if (!shown) return;
    const disabled = connectionStatus !== "connected";
    return (
      <Space size="small" direction="horizontal">
        {connectionStatus !== "" ? (
          <span title={connectionStatus}>
            <ConnectionStatusIcon status={connectionStatus} />
          </span>
        ) : undefined}
        <Space.Compact size="small">
          <Tooltip title="Reduce font size">
            <Button
              size="small"
              disabled={disabled}
              onClick={(e) => {
                e.stopPropagation();
                setTerminalFontSize((s) => s - 1);
              }}
              icon={<Icon name="minus" />}
            />
          </Tooltip>
          <Tooltip title="Increase font size">
            <Button
              size="small"
              disabled={disabled}
              onClick={(e) => {
                e.stopPropagation();
                setTerminalFontSize((s) => s + 1);
              }}
              icon={<Icon name="plus" />}
            />
          </Tooltip>
        </Space.Compact>
        <Space.Compact size="small">
          <Tooltip title="Change directory to current one">
            <Button
              size="small"
              disabled={disabled}
              onClick={(e) => {
                e.stopPropagation();
                setSyncPath((s) => s + 1);
              }}
            >
              <Icon name="arrow-down" />
            </Button>
          </Tooltip>
          <BSButton
            bsSize="xsmall"
            active={sync}
            disabled={disabled}
            title={"Sync directories between terminal and file listing"}
            onClick={(e) => {
              e.stopPropagation();
              setSync((s) => !s);
            }}
          >
            <Icon name="swap" rotate={"90"} />
          </BSButton>
        </Space.Compact>
      </Space>
    );
  }

  function setActiveKeyHandler(keys: PanelKey[]) {
    setActiveKeys(keys);
    storeFlyoutState(project_id, "files", {
      files: {
        selected: { show: keys.includes("selected") },
        terminal: { show: keys.includes("terminal") },
      },
    });
  }

  const style: CSS = {
    background: COLORS.GRAY_LL,
    borderRadius: 0,
    border: "none",
  } as const;

  const items: CollapseProps["items"] = [
    {
      key: "selected",
      label: renderSelectedHeader(),
      extra: renderSelectExtra(),
      style,
      className: "cc-project-flyout-files-panel",
      children: renderSelected(),
    },
    {
      key: "terminal",
      label: terminalHeader(),
      extra: renderTerminalExtra(),
      style: { ...style, borderTop: FIX_BORDER },
      className: "cc-project-flyout-files-panel",
      children: renderTerminal(),
    },
  ];

  return (
    <Collapse
      ref={collapseRef}
      bordered={false}
      activeKey={activeKeys}
      onChange={(key) => setActiveKeyHandler(key as PanelKey[])}
      size="small"
      expandIcon={({ isActive }) => (
        <CaretRightOutlined rotate={isActive ? 90 : 0} />
      )}
      destroyOnHidden={true}
      style={{
        ...style,
        flex: "0 0 auto",
        borderTop: FIX_BORDER,
      }}
      items={items}
    />
  );
}
