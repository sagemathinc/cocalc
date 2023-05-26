/*
 *  This file is part of CoCalc: Copyright © 2023 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { Input } from "antd";

import {
  CSS,
  redux,
  useActions,
  useMemo,
  useRef,
  useState,
  useTypedRedux,
} from "@cocalc/frontend/app-framework";
import { Icon, IconName, Loading, TimeAgo } from "@cocalc/frontend/components";
import { handle_log_click } from "@cocalc/frontend/components/path-link";
import useVirtuosoScrollHook from "@cocalc/frontend/components/virtuoso-scroll-hook";
import { file_options } from "@cocalc/frontend/editor-tmp";
import { EventRecordMap } from "@cocalc/frontend/project/history/types";
import { User } from "@cocalc/frontend/users";
import { Virtuoso, VirtuosoHandle } from "react-virtuoso";
import { FileListItem, fileItemStyle } from "./components";

interface OpenedFile {
  filename: string;
  time: Date;
  account_id: string;
}
interface Props {
  project_id: string;
  max?: number;
  wrap: (list: JSX.Element, style?: CSS) => JSX.Element;
}

export function LogFlyout({ max = 100, project_id, wrap }: Props): JSX.Element {
  const actions = useActions({ project_id });
  const project_log = useTypedRedux({ project_id }, "project_log");
  const openFiles = useTypedRedux({ project_id }, "open_files_order");
  const user_map = useTypedRedux("users", "user_map");
  const virtuosoScroll = useVirtuosoScrollHook({
    cacheId: `${project_id}::flyout::log`,
  });
  const virtuosoRef = useRef<VirtuosoHandle>(null);

  const [searchTerm, setSearchTerm] = useState<string>("");

  const log: OpenedFile[] = useMemo(() => {
    if (project_log == null) return [];

    const dedupe: string[] = [];

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
      .filter((entry: EventRecordMap) =>
        entry
          .getIn(["event", "filename"], "")
          .toLowerCase()
          .includes(searchTerm.toLowerCase())
      ) // <-- added filter
      .slice(0, max)
      .map((entry: EventRecordMap) => {
        return {
          filename: entry.getIn(["event", "filename"]),
          time: entry.get("time"),
          account_id: entry.get("account_id"),
        };
      })
      .toJS() as any;
  }, [project_log, searchTerm]);

  function renderItem(entry: OpenedFile) {
    const time = entry.time;
    const account_id = entry.account_id;
    const path = entry.filename;
    const info = file_options(path);
    const name: IconName = info.icon ?? "file";
    const isOpened: boolean = openFiles.some((p) => p === path);

    return (
      <FileListItem
        item={{ name: path, isopen: isOpened }}
        itemStyle={fileItemStyle(time?.getTime())}
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
          return renderItem(entry);
        }}
        {...virtuosoScroll}
      />
    );
  }

  return (
    <>
      <Input
        placeholder="Search..."
        value={searchTerm}
        onChange={(e) => setSearchTerm(e.target.value)}
        onKeyUp={onKeyUpHandler}
        style={{ width: "100%" }}
        allowClear
        prefix={<Icon name="search" />}
      />
      {wrap(list(), { marginTop: "10px" })}
    </>
  );
}
