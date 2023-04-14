import { List, Input, Space } from "antd";

import { CSSProperties, useState } from "react";
import { redux, useMemo, useTypedRedux } from "@cocalc/frontend/app-framework";
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

interface OpenedFile {
  filename: string;
  time: Date;
  account_id: string;
}
interface Props {
  project_id: string;
  max?: number;
  style?: CSSProperties;
}

export function HomeRecentFiles({ max = 100, project_id, style }: Props) {
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
    redux.getProjectStore(project_id).init_table("project_log"); // kick off loading it
    return <Loading />;
  }

  return (
    <>
      <List
        style={{ maxHeight: "500px", overflow: "auto", ...style }}
        size="small"
        header={
          <Space style={{ width: "100%" }}>
            Recent Files{" "}
            <Input
              placeholder="Search..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{ width: "350px" }}
            />
          </Space>
        }
        bordered
        dataSource={log}
        renderItem={renderItem}
      />
    </>
  );
}
