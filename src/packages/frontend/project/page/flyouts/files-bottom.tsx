/*
 *  This file is part of CoCalc: Copyright © 2023 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { CaretRightOutlined } from "@ant-design/icons";
import { Button, Collapse, Descriptions, Popover, Space } from "antd";
import immutable from "immutable";
import { debounce } from "lodash";

import {
  Button as BSButton,
  ButtonGroup,
} from "@cocalc/frontend/antd-bootstrap";
import {
  CSS,
  useActions,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useTypedRedux,
} from "@cocalc/frontend/app-framework";
import { ConnectionStatus } from "@cocalc/frontend/app/store";
import { Icon, TimeAgo } from "@cocalc/frontend/components";
import { useStudentProjectFunctionality } from "@cocalc/frontend/course";
import { file_options } from "@cocalc/frontend/editor-tmp";
import { ConnectionStatusIcon } from "@cocalc/frontend/frame-editors/frame-tree/title-bar";
import { open_new_tab } from "@cocalc/frontend/misc";
import {
  ACTION_BUTTONS_DIR,
  ACTION_BUTTONS_FILE,
  ACTION_BUTTONS_MULTI,
  isDisabledSnapshots,
} from "@cocalc/frontend/project/explorer/action-bar";
import { VIEWABLE_FILE_EXT } from "@cocalc/frontend/project/explorer/file-listing/file-row";
import {
  DirectoryListing,
  DirectoryListingEntry,
  FileMap,
} from "@cocalc/frontend/project/explorer/types";
import { url_href } from "@cocalc/frontend/project/utils";
import { FILE_ACTIONS } from "@cocalc/frontend/project_actions";
import {
  filename_extension,
  human_readable_size,
  path_split,
  path_to_file,
  plural,
  trunc_middle,
} from "@cocalc/util/misc";
import { COLORS } from "@cocalc/util/theme";
import { FIX_BORDER } from "../common";
import { TerminalFlyout } from "./files-terminal";
import { getFlyoutFiles, storeFlyoutState } from "./state";

const PANEL_STYLE: CSS = {
  width: "100%",
  paddingLeft: "10px",
  paddingRight: "10px",
  paddingBottom: "5px",
};

const PANEL_KEYS = ["selected", "terminal"];
type PanelKey = (typeof PANEL_KEYS)[number];

interface FilesBottomProps {
  project_id: string;
  checked_files: immutable.Set<string>;
  directoryData: [DirectoryListing, FileMap];
  projectIsRunning: boolean;
  rootHeightPx: number;
  open: (
    e: React.MouseEvent | React.KeyboardEvent,
    index: number,
    skip?: boolean
  ) => void;
  showFileSharingDialog(file): void;
}

export function FilesBottom({
  project_id,
  checked_files,
  directoryData,
  projectIsRunning,
  rootHeightPx,
  open,
  showFileSharingDialog,
}: FilesBottomProps) {
  const [directoryFiles, fileMap] = directoryData;
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

  function getFile(name: string): DirectoryListingEntry | undefined {
    const basename = path_split(name).tail;
    return fileMap[basename];
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

  useEffect(() => {
    // if any selected and nothing in state, open "selected".
    // this is to teach users this can be expanded.
    if (
      checked_files.size > 0 &&
      getFlyoutFiles(project_id).selected?.show == null
    ) {
      setActiveKeys(["selected", ...activeKeys]);
    }
  }, [checked_files]);

  const singleFile = useMemo(() => {
    if (checked_files.size === 1) {
      return getFile(checked_files.first() ?? "");
    }
  }, [checked_files, directoryFiles]);

  // if rootRef changes size, increase resize
  useLayoutEffect(() => {
    if (collapseRef.current == null) return;
    const observer = new ResizeObserver(triggerResize);
    observer.observe(collapseRef.current);
    return () => observer.disconnect();
  }, [collapseRef.current]);

  function renderTerminal() {
    if (!projectIsRunning) {
      return (
        <div>You have to start the project to be able to run a terminal.</div>
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

  function renderButtons(names) {
    return (
      <Space direction="horizontal" wrap>
        {checked_files.size > 0 ? renderOpenFile() : undefined}
        <Space.Compact size="small">
          {names.map((name) => {
            const disabled =
              isDisabledSnapshots(name) &&
              (current_path?.startsWith(".snapshots") ?? false);

            const { name: actionName, icon, hideFlyout } = FILE_ACTIONS[name];
            if (hideFlyout) return;
            return (
              <Popover key={name} content={`${actionName}...`}>
                <Button
                  size="small"
                  key={name}
                  disabled={disabled}
                  onClick={() => {
                    // TODO re-using the existing controls is a stopgap. make this part of the flyouts.
                    actions?.set_active_tab("files");
                    actions?.set_file_action(
                      name,
                      () => path_split(checked_files.first()).tail
                    );
                  }}
                >
                  <Icon name={icon} />
                </Button>
              </Popover>
            );
          })}
        </Space.Compact>
      </Space>
    );
  }

  async function openAllSelectedFiles(e: React.MouseEvent) {
    e.stopPropagation();
    const skipDirs = checked_files.size > 1;
    for (const file of checked_files) {
      const basename = path_split(file).tail;
      const index = directoryFiles.findIndex((f) => f.name === basename);
      // skipping directories, because it makes no sense to flip through them rapidly
      if (skipDirs && getFile(file)?.isdir) {
        open(e, index, true);
        continue;
      }
      open(e, index);
      // wait 10ms to avoid opening all files at once
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }

  function renderOpenFile() {
    if (checked_files.size === 0) return;
    return (
      <Popover
        content={
          checked_files.size === 1
            ? "Or double-click file in listing"
            : "Open all selected files"
        }
      >
        <Button type="primary" size="small" onClick={openAllSelectedFiles}>
          <Icon name="external-link" /> Open
        </Button>
      </Popover>
    );
  }

  function renderDownloadView() {
    if (!singleFile) return;
    const { name, isdir, size = 0 } = singleFile;
    if (isdir) return;
    const full_path = path_to_file(current_path, name);
    const ext = (filename_extension(name) ?? "").toLowerCase();
    const showView = VIEWABLE_FILE_EXT.includes(ext);
    // the "href" part makes the link right-click copyable
    const url = url_href(project_id, full_path);
    const showDownload = !student_project_functionality.disableActions;
    const sizeStr = human_readable_size(size);

    return (
      <>
        {showDownload ? (
          <Popover
            content={
              <>
                <Icon name="cloud-download" /> Download this {sizeStr} file
                <br />
                to your own computer.
              </>
            }
          >
            <Button
              size="small"
              href={`${url_href}`}
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
          </Popover>
        ) : undefined}
        {showView ? (
          <Popover content="View file in new tab">
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
          </Popover>
        ) : undefined}
      </>
    );
  }

  function renderDownloadViewFile() {
    if (!singleFile) return renderSelectDeselectButton();
    return <Space.Compact size="small">{renderDownloadView()}</Space.Compact>;
  }

  function renderFileInfo() {
    if (singleFile != null) {
      const { size, mtime, isdir } = singleFile;
      const age = typeof mtime === "number" ? 1000 * mtime : null;
      return (
        <Descriptions size="small" layout="horizontal" column={1}>
          {age ? (
            <Descriptions.Item label="Modified" span={1}>
              <TimeAgo date={new Date(age)} />
            </Descriptions.Item>
          ) : undefined}
          {isdir ? (
            <Descriptions.Item label="Contains">
              {size} {plural(size, "item")}
            </Descriptions.Item>
          ) : (
            <Descriptions.Item label="Size">
              {human_readable_size(size)}
            </Descriptions.Item>
          )}
          {singleFile.is_public ? (
            <Descriptions.Item label="Published">
              <Button
                size="small"
                icon={<Icon name="share-square" />}
                onClick={(e) => {
                  e.stopPropagation();
                  showFileSharingDialog(singleFile);
                }}
              >
                configure
              </Button>
            </Descriptions.Item>
          ) : undefined}
        </Descriptions>
      );
    }

    // summary of multiple selected files
    if (checked_files.size > 1) {
      let [totSize, startDT, endDT] = [0, new Date(0), new Date(0)];
      for (const f of checked_files) {
        const file = getFile(f);
        if (file == null) continue;
        const { size = 0, mtime, isdir } = file;
        totSize += isdir ? 0 : size;
        if (typeof mtime === "number") {
          const dt = new Date(1000 * mtime);
          if (startDT.getTime() === 0 || dt < startDT) startDT = dt;
          if (endDT.getTime() === 0 || dt > endDT) endDT = dt;
        }
      }

      return (
        <Descriptions size="small" layout="horizontal" column={1}>
          <Descriptions.Item label="Total size" span={1}>
            {human_readable_size(totSize)}
          </Descriptions.Item>
          {startDT.getTime() > 0 ? (
            <Descriptions.Item label="Modified" span={1}>
              <div>
                <TimeAgo date={startDT} /> – <TimeAgo date={endDT} />
              </div>
            </Descriptions.Item>
          ) : undefined}
        </Descriptions>
      );
    }
  }

  function renderSelectedControls() {
    return (
      <Space direction="vertical" size="small" style={PANEL_STYLE}>
        {singleFile
          ? singleFile.isdir
            ? renderButtons(ACTION_BUTTONS_DIR)
            : renderButtons(ACTION_BUTTONS_FILE.filter((n) => n !== "download"))
          : checked_files.size > 1
          ? renderButtons(ACTION_BUTTONS_MULTI)
          : undefined}
        {renderFileInfo()}
      </Space>
    );
  }

  function renderSelected() {
    if (checked_files.size === 0) {
      let totSize = 0;
      for (const f of directoryFiles) {
        if (!f.isdir) totSize += f.size ?? 0;
      }
      return (
        <div style={PANEL_STYLE}>
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
        if (f.isdir) {
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
      const iconName = singleFile.isdir
        ? "folder"
        : file_options(name)?.icon ?? "file";
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
        <ButtonGroup>
          <Popover content="Reduce font size">
            <Button
              size="small"
              disabled={disabled}
              onClick={(e) => {
                e.stopPropagation();
                setTerminalFontSize((s) => s - 1);
              }}
            >
              A-
            </Button>
          </Popover>
          <Popover content="Increase font size">
            <Button
              size="small"
              disabled={disabled}
              onClick={(e) => {
                e.stopPropagation();
                setTerminalFontSize((s) => s + 1);
              }}
            >
              A+
            </Button>
          </Popover>
        </ButtonGroup>
        <ButtonGroup>
          <Popover content="Change directory to current one">
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
          </Popover>
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
        </ButtonGroup>
      </Space>
    );
  }

  function renderSelectDeselectButton() {
    if (checked_files.size === 0) {
      return (
        <Button
          size="small"
          onClick={(e) => {
            e.stopPropagation();
            actions?.set_file_list_checked(
              directoryFiles
                .filter((f) => f.name !== "..")
                .map((f) => path_to_file(current_path, f.name))
            );
          }}
        >
          Select all
        </Button>
      );
    } else {
      return (
        <Button
          size="small"
          onClick={(e) => {
            e.stopPropagation();
            actions?.set_all_files_unchecked();
          }}
        >
          Deselect all
        </Button>
      );
    }
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
      destroyInactivePanel={true}
      style={{
        ...style,
        flex: "0 0 auto",
        borderTop: FIX_BORDER,
      }}
    >
      <Collapse.Panel
        className="cc-project-flyout-files-panel"
        header={renderSelectedHeader()}
        key="selected"
        style={style}
        extra={renderDownloadViewFile()}
      >
        {renderSelected()}
      </Collapse.Panel>
      <Collapse.Panel
        className="cc-project-flyout-files-panel"
        header={terminalHeader()}
        extra={renderTerminalExtra()}
        key="terminal"
        style={{ ...style, borderTop: FIX_BORDER }}
      >
        {renderTerminal()}
      </Collapse.Panel>
    </Collapse>
  );
}
