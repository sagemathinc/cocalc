/*
 *  This file is part of CoCalc: Copyright © 2023 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import {
  Loading,
  Paragraph,
  PathLink,
  TimeAgo,
  Title,
} from "@cocalc/frontend/components";
import { useTypedRedux } from "@cocalc/frontend/app-framework";
import { User } from "../../../users";

interface Props {
  project_id: string;
}

export function HomeRecentFiles(props: Props) {
  const { project_id } = props;

  const project_log = useTypedRedux({ project_id }, "project_log");
  const user_map = useTypedRedux("users", "user_map");

  function recent() {
    if (project_log == null) {
      return <Loading />;
    }
    const log = project_log.slice(0, 5);
    return (
      <Paragraph>
        {log
          .filter((entry) => entry.event === "open")
          .map((entry, i) => {
            const time = entry.get("time");
            const account_id = entry.get("account_id");
            return (
              <div key={i}>
                <>
                  <PathLink path={entry.filename} project_id={project_id} />{" "}
                  <User user_map={user_map} account_id={account_id} /> edited{" "}
                  <TimeAgo date={time} />
                </>
              </div>
            );
          })}
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
