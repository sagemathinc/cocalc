/*
 *  This file is part of CoCalc: Copyright © 2023 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Flex, Input, List } from "antd";
import { useIntl } from "react-intl";

import {
  CSS,
  redux,
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
import { file_options } from "@cocalc/frontend/editor-tmp";
import { labels } from "@cocalc/frontend/i18n";
import { handleFileEntryClick } from "@cocalc/frontend/project/history/utils";
import {
  useRecentFiles,
  type OpenedFile,
} from "@cocalc/frontend/projects/util";
import { User } from "@cocalc/frontend/users";

interface Props {
  project_id: string;
  max?: number;
  style?: CSS;
  mode?: "box" | "embed";
}

export function HomeRecentFiles({
  max = 100,
  project_id,
  style,
  mode = "box",
}: Props): React.JSX.Element {
  const intl = useIntl();
  const project_log = useTypedRedux({ project_id }, "project_log");
  const user_map = useTypedRedux("users", "user_map");

  const [searchTerm, setSearchTerm] = useState<string>("");

  const log: OpenedFile[] = useRecentFiles(project_log, max, searchTerm);

  function renderItemInfo({ account_id, time }) {
    return (
      <>
        {" "}
        {/* this space is intentional! */}
        <Text type="secondary">
          by <User user_map={user_map} account_id={account_id} />{" "}
          <TimeAgo date={time} />
        </Text>
      </>
    );
  }

  function renderItem(entry: OpenedFile) {
    const time = entry.time;
    const account_id = entry.account_id;
    const path = entry.filename;
    const info = file_options(path);
    const name: IconName = info.icon ?? "file";
    return (
      <List.Item
        onClick={(e) => handleFileEntryClick(e, path, project_id)}
        className="cc-project-home-recent-files"
      >
        <Icon name={name} />{" "}
        <PathLink
          trunc={48}
          full={true}
          style={{ fontWeight: "bold" }}
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

  function onKeyUpHandler(e) {
    // if esc key is pressed, empty the search term
    if (e.key === "Escape") {
      setSearchTerm("");
    }
  }

  function renderHeader(): React.JSX.Element | undefined {
    return (
      <Flex
        justify="space-between"
        align="center"
        style={{
          width: "100%",
          ...(mode === "embed" ? { padding: "10px" } : undefined),
        }}
      >
        <Text strong>{intl.formatMessage(labels.recent_files)}</Text>
        <Input
          placeholder="Search..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          onKeyUp={onKeyUpHandler}
          style={{ width: "350px" }}
        />
      </Flex>
    );
  }

  switch (mode) {
    case "box":
      return (
        <List
          style={{ maxHeight: "500px", overflow: "auto", ...style }}
          size="small"
          header={renderHeader()}
          bordered={true}
          dataSource={log}
          renderItem={renderItem}
        />
      );

    case "embed":
      return (
        <>
          {renderHeader()}
          <List
            style={{ maxHeight: "500px", overflow: "auto", ...style }}
            size="small"
            bordered={false}
            dataSource={log}
            renderItem={renderItem}
          />
        </>
      );
  }
}
