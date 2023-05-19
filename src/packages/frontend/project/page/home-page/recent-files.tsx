/*
 *  This file is part of CoCalc: Copyright © 2023 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { Input, List, Space } from "antd";

import {
  CSS,
  redux,
  useMemo,
  useState,
  useTypedRedux,
} from "@cocalc/frontend/app-framework";
import {
  Icon,
  IconName,
  Loading,
  PathLink,
  Text,
  TimeAgo,
} from "@cocalc/frontend/components";
import { handle_log_click } from "@cocalc/frontend/components/path-link";
import { file_options } from "@cocalc/frontend/editor-tmp";
import { EventRecordMap } from "@cocalc/frontend/project/history/types";
import { User } from "@cocalc/frontend/users";
import { unreachable } from "@cocalc/util/misc";
import { COLORS } from "@cocalc/util/theme";

interface OpenedFile {
  filename: string;
  time: Date;
  account_id: string;
}
interface Props {
  project_id: string;
  max?: number;
  style?: CSS;
  mode?: "flyout" | "home";
  wrap?: (list: JSX.Element, style?: CSS) => JSX.Element;
}

export function HomeRecentFiles({
  max = 100,
  project_id,
  style,
  mode = "home",
  wrap,
}: Props): JSX.Element {
  const project_log = useTypedRedux({ project_id }, "project_log");
  const user_map = useTypedRedux("users", "user_map");

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
      .toJS();
  }, [project_log, searchTerm]);

  function renderItemInfo({ account_id, time }) {
    switch (mode) {
      case "home":
        return (
          <>
            {" "}
            <Text type="secondary">
              by <User user_map={user_map} account_id={account_id} />{" "}
              <TimeAgo date={time} />
            </Text>
          </>
        );
      case "flyout":
        return (
          <>
            {/*<br />
             <Text type="secondary">
              <TimeAgo date={time} /> by{" "}
              <User user_map={user_map} account_id={account_id} />
            </Text> */}
          </>
        );
      default:
        unreachable(mode);
    }
  }

  function renderItem(entry) {
    const time = entry.time;
    const account_id = entry.account_id;
    const path = entry.filename;
    const info = file_options(path);
    const name: IconName = info.icon ?? "file";
    return (
      <List.Item
        onClick={(e) => handle_log_click(e, path, project_id)}
        className="cc-project-home-recent-files"
      >
        <Icon name={name} />{" "}
        <PathLink
          trunc={48}
          full={true}
          style={
            mode === "flyout"
              ? { color: COLORS.GRAY_M }
              : { fontWeight: "bold" }
          }
          path={path}
          project_id={project_id}
        />
        {renderItemInfo({ account_id, time })}
      </List.Item>
    );
  }

  if (project_log == null) {
    redux.getProjectStore(project_id).init_table("project_log"); // kick off loading it
    return <Loading />;
  }

  function renderHeader(): JSX.Element | undefined {
    switch (mode) {
      case "flyout":
        return undefined;
      case "home":
        return (
          <>
            <Space style={{ width: "100%" }}>
              Recent Files{" "}
              <Input
                placeholder="Search..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                style={{ width: "350px" }}
              />
            </Space>
          </>
        );
      default:
        unreachable(mode);
    }
  }

  function onKeyUpHandler(e) {
    // if esc key is pressed, empty the search term
    if (e.key === "Escape") {
      setSearchTerm("");
    }
  }

  function listStyle(): CSS {
    switch (mode) {
      case "flyout":
        return {
          width: "100%",
          overflowX: "hidden",
          overflowY: "auto",
          ...style,
        };
      case "home":
        return { maxHeight: "500px", overflow: "auto", ...style };
      default:
        unreachable(mode);
        return {};
    }
  }

  function list(): JSX.Element {
    return (
      <List
        style={listStyle()}
        size="small"
        header={renderHeader()}
        bordered={mode === "home"}
        dataSource={log}
        renderItem={renderItem}
      />
    );
  }

  if (wrap) {
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
  } else {
    return list();
  }
}
