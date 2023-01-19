/*
 *  This file is part of CoCalc: Copyright © 2021 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { Table } from "antd";

import { HistoricCounts } from "@cocalc/util/db-schema/stats";
import { Paragraph, Title } from "components/misc";
import { ZEROS } from "./misc";

interface Props {
  active: HistoricCounts;
  created: HistoricCounts;
  hubServers: { host: string; clients: number }[];
  style?: React.CSSProperties;
}

const columns = [
  { title: "Accounts", dataIndex: "type", key: "type" },
  { title: "Hour", dataIndex: "1h", key: "1h" },
  { title: "Day", dataIndex: "1d", key: "1d" },
  { title: "Week", dataIndex: "7d", key: "7d" },
  { title: "Month", dataIndex: "30d", key: "30d" },
];

function connectedUsers(hubServers): number {
  if (hubServers == null || hubServers.length === 0) {
    return 0;
  } else {
    return hubServers.map((x) => x.clients).reduce((s, t) => s + t);
  }
}

export default function ActiveUsers({
  created,
  active,
  hubServers,
  style,
}: Props) {
  const rows = [
    { type: "In use", ...ZEROS, ...active },
    { type: "Created", ...ZEROS, ...created },
  ];
  return (
    <div style={style}>
      <Title level={2}>Connected Users: {connectedUsers(hubServers)}</Title>
      <Paragraph>
        There are {connectedUsers(hubServers)} users connected right now; of
        these {active["5min"]} actively edited a file in the last 5 minutes.
        Track the number of users that were recently active or created new
        accounts below.
      </Paragraph>

      <Table
        dataSource={rows}
        columns={columns}
        bordered
        pagination={false}
        rowKey={"type"}
      />
    </div>
  );
}
