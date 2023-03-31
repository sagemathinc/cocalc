/*
 *  This file is part of CoCalc: Copyright © 2023 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import {
  Loading,
  Paragraph,
  PathLink,
  Text,
  TimeAgo,
  Title,
} from "@cocalc/frontend/components";
import { useMemo, useTypedRedux } from "@cocalc/frontend/app-framework";
import { EventRecordMap } from "../../history/types";
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
 */
export function HomeRecentFiles(props: Props) {
  const { project_id } = props;

  const project_log = useTypedRedux({ project_id }, "project_log");
  const user_map = useTypedRedux("users", "user_map");

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

  function recent() {
    if (project_log == null) {
      return <Loading />;
    }

    return (
      <Paragraph>
        <ul>
          {log.map((entry, i) => {
            const time = entry.time;
            const account_id = entry.account_id;
            return (
              <li key={i}>
                <>
                  <PathLink
                    trunc={32}
                    full={true}
                    style={{ fontWeight: "bold" }}
                    path={entry.filename}
                    project_id={project_id}
                  />{" "}
                  <Text type="secondary">
                    by <User user_map={user_map} account_id={account_id} />{" "}
                    <TimeAgo date={time} />
                  </Text>
                </>
              </li>
            );
          })}
        </ul>
      </Paragraph>
    );
  }

  return (
    <>
      <Title level={3}>Recent files</Title>
      {recent()}
    </>
  );
}
