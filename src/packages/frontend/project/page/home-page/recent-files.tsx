/*
 *  This file is part of CoCalc: Copyright © 2023 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { List } from "antd";

import { useMemo, useTypedRedux } from "@cocalc/frontend/app-framework";
import {
  Icon,
  IconName,
  Loading,
  PathLink,
  Text,
  TimeAgo,
  Title,
} from "@cocalc/frontend/components";
import { handle_log_click } from "@cocalc/frontend/components/path-link";
import { file_options } from "@cocalc/frontend/editor-tmp";
import { EventRecordMap } from "@cocalc/frontend/project/history/types";
import { User } from "@cocalc/frontend/users";

interface OpenedFile {
  filename: string;
  time: Date;
  account_id: string;
}
interface Props {
  project_id: string;
}

/**
 * This is a distillation of the project log, showing only the most recently opened files.
 * The purpose is to be able to quickly jump to a file that was recently opened.
 */
export function HomeRecentFiles(props: Props) {
  const { project_id } = props;

  const project_log = useTypedRedux({ project_id }, "project_log");
  const user_map = useTypedRedux("users", "user_map");

  // select unique files, that were opened in that project and sort by time
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
      .slice(0, 10)
      .map((entry: EventRecordMap) => {
        return {
          filename: entry.getIn(["event", "filename"]),
          time: entry.get("time"),
          account_id: entry.get("account_id"),
        };
      })
      .toJS();
  }, [project_log]);

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
          trunc={32}
          full={true}
          style={{ fontWeight: "bold" }}
          path={path}
          project_id={project_id}
        />{" "}
        <Text type="secondary">
          by <User user_map={user_map} account_id={account_id} />{" "}
          <TimeAgo date={time} />
        </Text>
      </List.Item>
    );
  }

  if (project_log == null) {
    return <Loading />;
  }

  return (
    <List
      size="small"
      header={<Title level={4}>Recent files</Title>}
      bordered
      dataSource={log}
      renderItem={renderItem}
    />
  );
}
