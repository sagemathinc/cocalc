/*
 *  This file is part of CoCalc: Copyright © 2023 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { Button, Input, Radio } from "antd";
import { Virtuoso, VirtuosoHandle } from "react-virtuoso";

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
import { Icon, Loading, TimeAgo } from "@cocalc/frontend/components";
import useVirtuosoScrollHook from "@cocalc/frontend/components/virtuoso-scroll-hook";
import { LogEntry } from "@cocalc/frontend/project/history/log-entry";
import {
  EventRecordMap,
  to_search_string,
} from "@cocalc/frontend/project/history/types";
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
import { debounce } from "lodash";
import { handle_log_click } from "../../history/utils";
import { FIX_BORDER } from "../common";
import { FIXED_PROJECT_TABS } from "../file-tab";
import { FileListItem, fileItemStyle } from "./components";
import { FLYOUT_EXTRA_WIDTH_PX } from "./consts";
import { FlyoutLogMode, getFlyoutLogMode, isFlyoutLogMode } from "./state";

export const FLYOUT_LOG_DEFAULT_MODE = "files";

interface OpenedFile {
  filename: string;
  time: Date;
  account_id: string;
}

interface HeaderProps {
  project_id: string;
}

export function LogHeader({ project_id }: HeaderProps): JSX.Element {
  const [mode, setModeState] = useState<FlyoutLogMode>(
    getFlyoutLogMode(project_id)
  );

  function setMode(mode: FlyoutLogMode) {
    if (isFlyoutLogMode(mode)) {
      setModeState(mode);
    } else {
      console.warn(`Invalid flyout log mode: ${mode}`);
    }
  }

  // any mode change triggers an action to compute it
  const actions = useActions({ project_id });
  useEffect(() => actions?.setFlyoutLogMode(mode), [mode]);

  function renderToggle() {
    return (
      <Radio.Group
        value={mode}
        onChange={(val) => setMode(val.target.value)}
        size="small"
      >
        <Radio.Button value="files">Files</Radio.Button>
        <Radio.Button value="history">Activity</Radio.Button>
      </Radio.Group>
    );
  }

  return (
    <div style={{ flex: 1, fontWeight: "bold" }}>
      <Icon name={FIXED_PROJECT_TABS.log.icon} /> Recent {renderToggle()}
    </div>
  );
}

export function getTime(a): number {
  try {
    return a?.get("time")?.getTime() ?? 0;
  } catch (_err) {
    return 0;
  }
}

function deriveFiles(project_log, searchTerm: string, max: number) {
  const dedupe: string[] = [];
  const searchWords = search_split(searchTerm);

  return project_log
    .valueSeq()
    .filter(
      (entry: EventRecordMap) =>
        entry.getIn(["event", "filename"]) &&
        entry.getIn(["event", "event"]) === "open"
    )
    .sort((a, b) => getTime(b) - getTime(a))
    .filter((entry: EventRecordMap) => {
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

function deriveHistory(project_log, searchTerm: string, max: number) {
  const searchWords = search_split(searchTerm);

  return project_log
    .valueSeq()
    .filter(
      (entry: EventRecordMap) =>
        !(
          entry.getIn(["event", "filename"]) &&
          entry.getIn(["event", "event"]) === "open"
        )
    )
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
  wrap: (list: JSX.Element, style?: CSS) => JSX.Element;
  flyoutWidth: number;
}

export function LogFlyout({
  max = 1000,
  project_id,
  wrap,
  flyoutWidth,
}: Props): JSX.Element {
  const actions = useActions({ project_id });
  const mode: FlyoutLogMode = useTypedRedux({ project_id }, "flyout_log_mode");
  const project_log = useTypedRedux({ project_id }, "project_log");
  const project_log_all = useTypedRedux({ project_id }, "project_log_all");
  const openFiles = useTypedRedux({ project_id }, "open_files_order");
  const user_map = useTypedRedux("users", "user_map");
  const activeTab = useTypedRedux({ project_id }, "active_project_tab");
  const virtuosoScroll = useVirtuosoScrollHook({
    cacheId: `${project_id}::flyout::log`,
  });
  const virtuosoRef = useRef<VirtuosoHandle>(null);

  const search = useTypedRedux({ project_id }, "search") ?? "";
  const [searchTerm, setSearchTerm] = useState<string>("");

  const [scrollIdx, setScrollIdx] = useState<number | null>(null);
  const [scollIdxHide, setScrollIdxHide] = useState<boolean>(false);

  const activePath = useMemo(() => {
    return tab_to_path(activeTab);
  }, [activeTab]);

  const log: OpenedFile[] = useMemo(() => {
    const log = project_log_all ?? project_log;
    if (log == null) return [];

    switch (mode) {
      case "files":
        return deriveFiles(log, search, max);
      case "history":
        return deriveHistory(log, search, max);
      default:
        unreachable(mode);
    }
  }, [project_log, project_log_all, search, max, mode]);

  const showExtra = useMemo(
    () => flyoutWidth > FLYOUT_EXTRA_WIDTH_PX,
    [flyoutWidth]
  );

  // trigger a search state change, only once and with a debounce
  const setSearchState = debounce(
    (val: string): void => {
      actions?.setState({ search: val });
    },
    20,
    { leading: false, trailing: true }
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

  function renderFileItem(index: number, entry: OpenedFile) {
    const time = entry.time;
    const account_id = entry.account_id;
    const path = entry.filename;
    const isOpened: boolean = openFiles.some((p) => p === path);
    const isActive: boolean = activePath === path;

    return (
      <FileListItem
        item={{ name: path, isopen: isOpened, isactive: isActive }}
        extra={renderFileItemExtra(entry)}
        itemStyle={fileItemStyle(time?.getTime())}
        multiline={true}
        selected={!scollIdxHide && index === scrollIdx}
        onClick={(e) => handle_log_click(e, path, project_id)}
        onClose={(e: React.MouseEvent, path: string) => {
          e.stopPropagation();
          actions?.close_tab(path);
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
      />
    );
  }

  function renderHistoryItem(index: number, entry: any) {
    const highlight = !scollIdxHide && index === scrollIdx;
    const bgStyle = {
      ...fileItemStyle(entry.time?.getTime()),
      ...(highlight ? { background: COLORS.BLUE_LL } : {}),
    };

    return (
      <LogEntry
        mode="flyout"
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
      log.length
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
      how: "click-on-log-file-flyout",
    });
    handle_log_click(e, file.filename, project_id);
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

  function list(): JSX.Element {
    return (
      <Virtuoso
        ref={virtuosoRef}
        style={{}}
        increaseViewportBy={10}
        totalCount={log.length}
        itemContent={(index) => {
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
        {...virtuosoScroll}
      />
    );
  }

  function renderBottom() {
    if (project_log_all != null) return null;
    return (
      <div style={{ flex: "1 1 auto", borderTop: FIX_BORDER }}>
        <Button
          block
          type="text"
          onClick={() => {
            actions?.project_log_load_all();
          }}
        >
          Load all log entries...
        </Button>
      </div>
    );
  }

  return (
    <>
      <Input
        placeholder="Search..."
        style={{ flex: "1", marginRight: "10px" }}
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
      />
      {wrap(list(), { marginTop: "10px" })}
      {renderBottom()}
    </>
  );
}
