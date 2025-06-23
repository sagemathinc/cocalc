/*
 *  This file is part of CoCalc: Copyright © 2021 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
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

// Data collection got not implemented right now, so disabling "connection" and replacing by
// active during the last hour, which is probably more meaningful, since people can just
// leave browsers connected.

// function connectedUsers(hubServers): number {
//   if (hubServers == null || hubServers.length === 0) {
//     return 0;
//   } else {
//     return hubServers.map((x) => x.clients).reduce((s, t) => s + t);
//   }
// }

export default function ActiveUsers({ created, active, style }: Props) {
  const rows = [
    { type: "In use", ...ZEROS, ...active },
    { type: "Created", ...ZEROS, ...created },
  ];
  return (
    <div style={style}>
      <Title level={2}>Active Users: {active["1h"]}</Title>
      <Paragraph>
        Track the number of users that were recently active or created new
        accounts below. There were {active["5min"]} users who edited a file
        during the last 5 minutes.
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
