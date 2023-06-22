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
  useEffect,
  useMemo,
  useRef,
  useState,
  useTypedRedux,
} from "@cocalc/frontend/app-framework";
import { Icon, IconName, Loading, TimeAgo } from "@cocalc/frontend/components";
import useVirtuosoScrollHook from "@cocalc/frontend/components/virtuoso-scroll-hook";
import { file_options } from "@cocalc/frontend/editor-tmp";
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
import { handle_log_click } from "../../history/utils";
import { FIX_BORDER } from "../common";
import { FIXED_PROJECT_TABS } from "../file-tab";
import { FileListItem, fileItemStyle } from "./components";
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
}

export function LogFlyout({ max = 1000, project_id, wrap }: Props): JSX.Element {
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
        return deriveFiles(log, searchTerm, max);
      case "history":
        return deriveHistory(log, searchTerm, max);
      default:
        unreachable(mode);
    }
  }, [project_log, project_log_all, searchTerm, max, mode]);

  function renderFileItem(index: number, entry: OpenedFile) {
    const time = entry.time;
    const account_id = entry.account_id;
    const path = entry.filename;
    const info = file_options(path);
    const name: IconName = info.icon ?? "file";
    const isOpened: boolean = openFiles.some((p) => p === path);
    const isActive: boolean = activePath === path;

    return (
      <FileListItem
        item={{ name: path, isopen: isOpened, isactive: isActive }}
        itemStyle={fileItemStyle(time?.getTime())}
        multiline={true}
        selected={!scollIdxHide && index === scrollIdx}
        renderIcon={(_item, style) => <Icon style={style} name={name} />}
        onClick={(e) => handle_log_click(e, path, project_id)}
        onClose={(e: React.MouseEvent, path: string) => {
          e.stopPropagation();
          actions?.close_tab(path);
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
    return <Loading />;
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
    track("open-file", {
      project_id,
      path: file.filename,
      how: "click-on-log-file-flyout",
    });
    handle_log_click(e, file.filename, project_id);
  }

  function onKeyUpHandler(e) {
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
      }
    }

    // if esc key is pressed, empty the search term
    if (e.key === "Escape") {
      setSearchTerm("");
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
        onChange={(e) => setSearchTerm(e.target.value)}
        onKeyUp={onKeyUpHandler}
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
