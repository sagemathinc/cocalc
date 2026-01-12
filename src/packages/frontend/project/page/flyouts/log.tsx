/*
 *  This file is part of CoCalc: Copyright © 2023 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Alert, Button, Flex, Input, Space, Tooltip } from "antd";
import immutable from "immutable";
import { debounce } from "lodash";
import { FormattedMessage, useIntl } from "react-intl";
import { VirtuosoHandle } from "react-virtuoso";
import { Avatar } from "@cocalc/frontend/account/avatar/avatar";
import { Button as BSButton } from "@cocalc/frontend/antd-bootstrap";
import {
  CSS,
  redux,
  useActions,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTypedRedux,
} from "@cocalc/frontend/app-framework";
import { Icon, IconName, Loading, TimeAgo } from "@cocalc/frontend/components";
import StatefulVirtuoso from "@cocalc/frontend/components/stateful-virtuoso";
import { labels } from "@cocalc/frontend/i18n";
import { LogEntry } from "@cocalc/frontend/project/history/log-entry";
import {
  EventRecordMap,
  to_search_string,
} from "@cocalc/frontend/project/history/types";
import { handleFileEntryClick } from "@cocalc/frontend/project/history/utils";
import track from "@cocalc/frontend/user-tracking";
import { User } from "@cocalc/frontend/users";
import {
  search_match,
  search_split,
  strictMod,
  tab_to_path,
  unreachable,
} from "@cocalc/util/misc";
import { COLORS } from "@cocalc/util/theme";
import { FIX_BORDER } from "../common";
import {
  FLYOUT_EXTRA2_WIDTH_PX,
  FLYOUT_EXTRA_WIDTH_PX,
  FLYOUT_PADDING,
} from "./consts";
import { FileListItem } from "./file-list-item";
import {
  FlyoutLogDeduplicate,
  FlyoutLogMode,
  getFlyoutLogFilter,
} from "./state";
import { fileItemStyle } from "./utils";

interface OpenedFile {
  filename: string;
  time: Date;
  account_id: string;
}

export function getTime(a): number {
  try {
    return a?.get("time")?.getTime() ?? 0;
  } catch (_err) {
    return 0;
  }
}

function deriveFiles(
  project_log,
  searchTerm: string,
  max: number,
  deduplicate: boolean,
) {
  const dedupe: string[] = [];
  const searchWords = search_split(searchTerm);

  return project_log
    .valueSeq()
    .filter(
      (entry: EventRecordMap) =>
        entry.getIn(["event", "filename"]) &&
        entry.getIn(["event", "event"]) === "open",
    )
    .sort((a, b) => getTime(b) - getTime(a))
    .filter((entry: EventRecordMap) => {
      // pick all files if not deduplicated
      if (!deduplicate) return true;
      // otherwise, we check if the filename already appeared in the sorted list
      const fn = entry.getIn(["event", "filename"]);
      if (dedupe.includes(fn)) return false;
      dedupe.push(fn);
      return true;
    })
    .filter((entry: EventRecordMap) => {
      if (searchTerm === "") return true;
      const fName = entry.getIn(["event", "filename"], "").toLowerCase();
      return search_match(fName, searchWords);
    })
    .slice(0, max)
    .map((entry: EventRecordMap) => {
      return {
        filename: entry.getIn(["event", "filename"]),
        time: entry.get("time"),
        account_id: entry.get("account_id"),
      };
    })
    .toJS() as any;
}

// TODO: refactor project/history/types.ts and add type tests to clean this up

const PROJECT_EVENTS = [
  "project_start_requested",
  "project_stop_requested",
  "project_restart_requested",
  "project_stopped",
  "project_started",
  "start_project",
  "upgrade",
  "license",
  "delete_project",
  "undelete_project",
  "hide_project",
  "unhide_project",
  "software_environment",
] as const;

function isProjectEvent(event: string, entry: EventRecordMap): boolean {
  if (PROJECT_EVENTS.includes(event as any)) {
    return true;
  }
  if (event === "set") {
    const attrs = ["title", "description", "image", "name"];
    for (const attr of attrs) {
      if (typeof entry.getIn(["event", attr]) === "string") return true;
    }
  }
  return false;
}

function isFileEvent(event: string, entry: EventRecordMap): boolean {
  if (event === "open") {
    if (typeof entry.getIn(["event", "filename"]) === "string") {
      return true;
    }
  }
  return false;
}

const USER_EVENTS = [
  "invite_user",
  "invite_nonuser",
  "remove_collaborator",
] as const;

function isUserEvent(event: string): boolean {
  if (USER_EVENTS.includes(event as any)) {
    return true;
  }
  return false;
}

function deriveHistory(
  project_log,
  searchTerm: string,
  max: number,
  filter: {
    showOpenFiles: boolean;
    showFileActions: boolean;
    showProject: boolean;
    showShare: boolean;
    showUser: boolean;
    showOther: boolean;
  },
) {
  const {
    showOpenFiles,
    showFileActions,
    showProject,
    showShare,
    showUser,
    showOther,
  } = filter;
  const searchWords = search_split(searchTerm);

  return project_log
    .valueSeq()
    .filter((entry: EventRecordMap) => {
      const event = entry.getIn(["event", "event"]);
      if (isFileEvent(event, entry)) {
        return showOpenFiles;
      }
      if (event === "file_action") {
        return showFileActions;
      }
      if (isProjectEvent(event, entry)) {
        return showProject;
      }
      if (event === "public_path") {
        return showShare;
      }
      if (isUserEvent(event)) {
        return showUser;
      }
      return showOther;
    })
    .filter((entry: EventRecordMap) => {
      if (searchTerm === "") return true;
      const searchStr = to_search_string(entry.toJS());
      return search_match(searchStr, searchWords);
    })
    .sort((a, b) => getTime(b) - getTime(a))
    .slice(0, max)
    .toJS() as any;
}

interface Props {
  project_id: string;
  max?: number;
  wrap: (list: React.JSX.Element, style?: CSS) => React.JSX.Element;
  flyoutWidth: number;
}

export function LogFlyout({
  max = 1000,
  project_id,
  wrap,
  flyoutWidth,
}: Props): React.JSX.Element {
  const intl = useIntl();
  const actions = useActions({ project_id });
  const mode: FlyoutLogMode = useTypedRedux({ project_id }, "flyout_log_mode");
  const logFilter = useTypedRedux({ project_id }, "flyout_log_filter");
  const showOpenFiles = logFilter.contains("open");
  const showFileActions = logFilter.contains("files");
  const showProject = logFilter.contains("project");
  const showOther = logFilter.contains("other");
  const showUser = logFilter.contains("user");
  const showShare = logFilter.contains("share");
  const deduplicate: FlyoutLogDeduplicate = useTypedRedux(
    { project_id },
    "flyout_log_deduplicate",
  );
  const project_log = useTypedRedux({ project_id }, "project_log");
  const project_log_all = useTypedRedux({ project_id }, "project_log_all");
  const openFiles = useTypedRedux({ project_id }, "open_files_order");
  const user_map = useTypedRedux("users", "user_map");
  const activeTab = useTypedRedux({ project_id }, "active_project_tab");
  const otherSettings = useTypedRedux("account", "other_settings");
  const dimFileExtensions = !!otherSettings?.get("dim_file_extensions");
  const virtuosoRef = useRef<VirtuosoHandle>(null);

  const search = useTypedRedux({ project_id }, "search") ?? "";
  const [searchTerm, setSearchTerm] = useState<string>("");

  const [scrollIdx, setScrollIdx] = useState<number | null>(null);
  const [scrollIdxHide, setScrollIdxHide] = useState<boolean>(false);

  // restore the logFilter from local storage (mode is similar, restored in the LogHeader)
  useEffect(() => {
    const next = getFlyoutLogFilter(project_id);
    if (next == null) return; // nothing stored in local storage, hence just keeping the default
    actions?.setState({ flyout_log_filter: immutable.List(next) });
  }, []);

  const activePath = useMemo(() => {
    return tab_to_path(activeTab);
  }, [activeTab]);

  const log: OpenedFile[] = useMemo(() => {
    const log = project_log_all ?? project_log;
    if (log == null) return [];

    switch (mode) {
      case "files":
        return deriveFiles(log, search, max, deduplicate);
      case "history":
        return deriveHistory(log, search, max, {
          showOpenFiles,
          showFileActions,
          showProject,
          showShare,
          showUser,
          showOther,
        });
      default:
        unreachable(mode);
    }
  }, [project_log, project_log_all, search, max, mode, deduplicate, logFilter]);

  const [showExtra, showExtra2] = useMemo(() => {
    return [
      flyoutWidth > FLYOUT_EXTRA_WIDTH_PX,
      flyoutWidth > FLYOUT_EXTRA2_WIDTH_PX,
    ];
  }, [flyoutWidth]);

  // trigger a search state change, only once and with a debounce
  const setSearchState = debounce(
    (val: string): void => {
      actions?.setState({ search: val });
    },
    20,
    { leading: false, trailing: true },
  );

  const handleOnChange = useCallback((val: string) => {
    setScrollIdx(null);
    setSearchTerm(val);
    setSearchState(val);
  }, []);

  // incoming change, change the search term
  useEffect(() => {
    if (search === searchTerm) return;
    setScrollIdx(null);
    setSearchTerm(search);
  }, [search]);

  // end of hooks

  function renderFileItemExtra(entry: OpenedFile) {
    if (!showExtra) return null;
    if (!entry.time) return;
    return <TimeAgo date={entry.time} />;
  }

  function renderFileItemExtra2(entry: OpenedFile) {
    if (!showExtra2) return null;
    const { account_id } = entry;
    if (!account_id) return;
    return (
      <>
        <Avatar account_id={account_id} size={24} />{" "}
        <User account_id={entry.account_id} user_map={user_map} />
      </>
    );
  }

  function renderFileItem(index: number, entry: OpenedFile) {
    const time = entry.time;
    const account_id = entry.account_id;
    const path = entry.filename;
    const isOpen: boolean = openFiles.some((p) => p === path);
    const isActive: boolean = activePath === path;

    return (
      <FileListItem
        mode="log"
        item={{ name: path, isOpen, isActive }}
        extra={renderFileItemExtra(entry)}
        extra2={renderFileItemExtra2(entry)}
        itemStyle={fileItemStyle(time?.getTime())}
        multiline={true}
        selected={!scrollIdxHide && index === scrollIdx}
        onClick={(e) => {
          track("open-file", {
            project_id,
            path,
            how: "click-on-log-file-flyout",
          });
          handleFileEntryClick(e, path, project_id);
        }}
        onMouseDown={(e: React.MouseEvent) => {
          if (e.button === 1) {
            // middle mouse click
            actions?.close_tab(path);
          }
        }}
        tooltip={
          <>
            Last opened <TimeAgo date={time} /> by{" "}
            <User account_id={account_id} user_map={user_map} />
          </>
        }
        dimFileExtensions={dimFileExtensions}
      />
    );
  }

  function renderHistoryItem(index: number, entry: any) {
    const highlight = !scrollIdxHide && index === scrollIdx;
    const bgStyle = {
      ...fileItemStyle(entry.time?.getTime()),
      ...(highlight ? { background: COLORS.BLUE_LL } : {}),
    };

    return (
      <LogEntry
        mode="flyout"
        flyoutExtra={showExtra}
        id={entry.id}
        time={entry.time}
        project_id={project_id}
        account_id={entry.account_id}
        event={entry.event}
        user_map={user_map}
        backgroundStyle={bgStyle}
      />
    );
  }

  if (project_log == null) {
    redux.getProjectStore(project_id).init_table("project_log"); // kick off loading it
    return <Loading theme="medium" transparent />;
  }

  function doScroll(dx: -1 | 1) {
    const nextIdx = strictMod(
      scrollIdx == null ? (dx === 1 ? 0 : -1) : scrollIdx + dx,
      log.length,
    );
    setScrollIdx(nextIdx);
    virtuosoRef.current?.scrollToIndex({
      index: nextIdx,
      align: "center",
    });
  }

  function open(e: React.MouseEvent | React.KeyboardEvent, index: number) {
    if (mode !== "files") return;
    const file: OpenedFile = log[index];
    if (file == null) return;
    track("open-file", {
      project_id,
      path: file.filename,
      how: "keypress-on-log-file-flyout",
    });
    handleFileEntryClick(e, file.filename, project_id);
  }

  function onKeyDownHandler(e) {
    // if arrow key down or up, then scroll to next item
    const dx = e.code === "ArrowDown" ? 1 : e.code === "ArrowUp" ? -1 : 0;
    if (dx != 0) {
      doScroll(dx);
    }

    // return key pressed
    else if (e.code === "Enter" && mode === "files") {
      if (scrollIdx != null) {
        open(e, scrollIdx);
        setScrollIdx(null);
      } else if (searchTerm != "" && log.length > 0) {
        open(e, 0);
      }
    }

    // if esc key is pressed, empty the search term and reset scroll index
    if (e.key === "Escape") {
      handleOnChange("");
    }
  }

  function list(): React.JSX.Element {
    return (
      <StatefulVirtuoso
        ref={virtuosoRef}
        cacheId={`${project_id}::flyout::log`}
        style={{}}
        increaseViewportBy={10}
        totalCount={log.length + 1}
        initialTopMostItemIndex={0}
        itemContent={(index) => {
          if (index == log.length) {
            return renderShowAll();
          }
          const entry = log[index];
          if (entry == null) {
            // shouldn't happen
            return <div key={index} style={{ height: "1px" }}></div>;
          }
          switch (mode) {
            case "files":
              return renderFileItem(index, entry);
            case "history":
              return renderHistoryItem(index, entry);
          }
        }}
      />
    );
  }

  function renderShowAll() {
    if (project_log_all != null) {
      return <div style={{ height: "1px" }} />;
    }
    return (
      <div style={{ flex: "1 1 auto", borderTop: FIX_BORDER }}>
        <Button
          block
          type="text"
          onClick={() => {
            actions?.project_log_load_all();
          }}
        >
          <FormattedMessage
            id="page.flyouts.log.show_all.label"
            description={"Show older activities in the list"}
            defaultMessage={"Load older log entries..."}
          />
        </Button>
      </div>
    );
  }

  function renderDedup() {
    if (mode === "history") return null;
    const icon: IconName = deduplicate ? "file" : "copy";
    return (
      <BSButton
        active={!deduplicate}
        bsSize="xsmall"
        title={
          <FormattedMessage
            id="page.flyouts.log.deduplicate.tooltip"
            description={"The list of activities is deduplicated"}
            defaultMessage={
              "If enabled, the list contains duplicate entries. By default, only the most recent open file activity is shown."
            }
          />
        }
        onClick={(e) => {
          e.stopPropagation();
          actions?.setFlyoutLogDeduplicate(!deduplicate);
        }}
      >
        <Icon name={icon} />{" "}
        <FormattedMessage
          id="page.flyouts.log.deduplicate.label"
          description={
            "Show all activities in the list, which are maybe deduplicated"
          }
          defaultMessage={"Show all"}
        />
      </BSButton>
    );
  }

  function renderFilter() {
    if (mode === "files") return null;
    return (
      <>
        <Space.Compact>
          <BSButton
            active={false}
            bsSize="xsmall"
            onClick={() => actions?.resetFlyoutLogFilter()}
            title={
              "Toggle the filter buttons on the right to show/hide specific groups of events. Click this button to reset the filter."
            }
          >
            Show:
          </BSButton>
          <BSButton
            active={showOpenFiles}
            bsSize="xsmall"
            onClick={() => {
              actions?.setFlyoutLogFilter("open", !showOpenFiles);
            }}
            title={"Show file open events"}
          >
            <Icon name="edit" />
          </BSButton>
          <BSButton
            active={showFileActions}
            bsSize="xsmall"
            onClick={() => {
              actions?.setFlyoutLogFilter("files", !showFileActions);
            }}
            title={"Show file action events"}
          >
            <Icon name="files" />
          </BSButton>
          <BSButton
            active={showProject}
            bsSize="xsmall"
            onClick={() => {
              actions?.setFlyoutLogFilter("project", !showProject);
            }}
            title={"Show project events"}
          >
            <Icon name="edit" />
          </BSButton>
          <BSButton
            active={showShare}
            bsSize="xsmall"
            onClick={() => {
              actions?.setFlyoutLogFilter("share", !showShare);
            }}
            title={"Show sharing files events"}
          >
            <Icon name="share-square" />
          </BSButton>
          <BSButton
            active={showUser}
            bsSize="xsmall"
            onClick={() => {
              actions?.setFlyoutLogFilter("user", !showUser);
            }}
            title={"Show user events"}
          >
            <Icon name="users" />
          </BSButton>
          <BSButton
            active={showOther}
            bsSize="xsmall"
            onClick={() => {
              actions?.setFlyoutLogFilter("other", !showOther);
            }}
            title={"Show other events"}
          >
            <Icon name="solution" />
          </BSButton>
        </Space.Compact>
      </>
    );
  }

  function activeFilterWarning() {
    if (mode !== "history") return null;
    if (logFilter.size > 0) return null;

    return (
      <Alert
        type="info"
        banner
        showIcon={false}
        style={{ padding: FLYOUT_PADDING, margin: 0 }}
        description={
          <>
            <Tooltip title="Reset filter" placement="bottom">
              <Button
                size="small"
                type="text"
                style={{ float: "right", color: COLORS.GRAY_M }}
                onClick={() => actions?.resetFlyoutLogFilter()}
                icon={<Icon name="close-circle-filled" />}
              >
                {intl.formatMessage(labels.reset)}
              </Button>
            </Tooltip>
            <FormattedMessage
              id="page.flyouts.log.filter_message"
              description={"The list of activities is filtered"}
              defaultMessage={"All activities are filtered!"}
            />
          </>
        }
      />
    );
  }

  function renderControls() {
    switch (mode) {
      case "files":
        return renderDedup();
      case "history":
        return renderFilter();
      default:
        unreachable(mode);
    }
  }

  return (
    <>
      <Space
        direction="vertical"
        style={{
          flex: "0 0 auto",
          borderBottom: FIX_BORDER,
        }}
      >
        <Flex
          justify="space-between"
          align="center"
          gap="middle"
          style={{ marginRight: FLYOUT_PADDING }}
          wrap="wrap"
        >
          <Input
            placeholder="Search..."
            size="small"
            value={searchTerm}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
              handleOnChange(e.target.value);
            }}
            onKeyDown={onKeyDownHandler}
            onFocus={() => setScrollIdxHide(false)}
            onBlur={() => setScrollIdxHide(true)}
            allowClear
            prefix={<Icon name="search" />}
            style={{ minWidth: "5em", flex: "1" }}
          />
          {renderControls()}
        </Flex>
        {activeFilterWarning()}
      </Space>
      {wrap(list(), { marginTop: "10px" })}
    </>
  );
}
