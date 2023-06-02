/*
 *  This file is part of CoCalc: Copyright © 2023 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { Input, Radio } from "antd";

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
import { handle_log_click } from "@cocalc/frontend/components/path-link";
import useVirtuosoScrollHook from "@cocalc/frontend/components/virtuoso-scroll-hook";
import { file_options } from "@cocalc/frontend/editor-tmp";
import { LogEntry } from "@cocalc/frontend/project/history/log-entry";
import {
  EventRecordMap,
  to_search_string,
} from "@cocalc/frontend/project/history/types";
import { User } from "@cocalc/frontend/users";
import {
  search_match,
  search_split,
  tab_to_path,
  unreachable,
} from "@cocalc/util/misc";
import { Virtuoso, VirtuosoHandle } from "react-virtuoso";
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
    <div style={{ flex: 1 }}>
      <Icon name={FIXED_PROJECT_TABS.log.icon} /> Recent {renderToggle()}
    </div>
  );
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
    .sort((a, b) => b.get("time").getTime() - a.get("time").getTime())
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
    .sort((a, b) => b.get("time").getTime() - a.get("time").getTime())
    .slice(0, max)
    .toJS() as any;
}

interface Props {
  project_id: string;
  max?: number;
  wrap: (list: JSX.Element, style?: CSS) => JSX.Element;
}

export function LogFlyout({ max = 100, project_id, wrap }: Props): JSX.Element {
  const actions = useActions({ project_id });
  const mode: FlyoutLogMode = useTypedRedux({ project_id }, "flyout_log_mode");
  const project_log = useTypedRedux({ project_id }, "project_log");
  const openFiles = useTypedRedux({ project_id }, "open_files_order");
  const user_map = useTypedRedux("users", "user_map");
  const activeTab = useTypedRedux({ project_id }, "active_project_tab");
  const virtuosoScroll = useVirtuosoScrollHook({
    cacheId: `${project_id}::flyout::log`,
  });
  const virtuosoRef = useRef<VirtuosoHandle>(null);

  const [searchTerm, setSearchTerm] = useState<string>("");

  const activePath = useMemo(() => {
    return tab_to_path(activeTab);
  }, [activeTab]);

  const log: OpenedFile[] = useMemo(() => {
    if (project_log == null) return [];

    switch (mode) {
      case "files":
        return deriveFiles(project_log, searchTerm, max);
      case "history":
        return deriveHistory(project_log, searchTerm, max);
      default:
        unreachable(mode);
    }
  }, [project_log, searchTerm, max, mode]);

  function renderFileItem(entry: OpenedFile) {
    const time = entry.time;
    const account_id = entry.account_id;
    const path = entry.filename;
    const info = file_options(path);
    const name: IconName = info.icon ?? "file";
    const isOpened: boolean = openFiles.some((p) => p === path);
    const isActive : boolean = activePath === path;

    return (
      <FileListItem
        item={{ name: path, isopen: isOpened, isactive: isActive }}
        itemStyle={fileItemStyle(time?.getTime())}
        multiline={true}
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

  function renderHistoryItem(entry: any) {
    return (
      <LogEntry
        mode="flyout"
        id={entry.id}
        time={entry.time}
        project_id={project_id}
        account_id={entry.account_id}
        event={entry.event}
        user_map={user_map}
        backgroundStyle={fileItemStyle(entry.time?.getTime())}
      />
    );
  }

  if (project_log == null) {
    redux.getProjectStore(project_id).init_table("project_log"); // kick off loading it
    return <Loading />;
  }

  function onKeyUpHandler(e) {
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
              return renderFileItem(entry);
            case "history":
              return renderHistoryItem(entry);
          }
        }}
        {...virtuosoScroll}
      />
    );
  }

  return (
    <>
      <Input
        placeholder="Search..."
        style={{ width: "100%" }}
        value={searchTerm}
        onChange={(e) => setSearchTerm(e.target.value)}
        onKeyUp={onKeyUpHandler}
        allowClear
        prefix={<Icon name="search" />}
      />
      {wrap(list(), { marginTop: "10px" })}
    </>
  );
}
