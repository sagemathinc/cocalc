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
  running: { free: number; member: number };
  style?: React.CSSProperties;
}

const columns = [
  { title: "Projects", dataIndex: "type", key: "type" },
  { title: "Now", dataIndex: "5min", key: "5m" },
  { title: "Hour", dataIndex: "1h", key: "1h" },
  { title: "Day", dataIndex: "1d", key: "1d" },
  { title: "Week", dataIndex: "7d", key: "7d" },
  { title: "Month", dataIndex: "30d", key: "30d" },
];

export default function ActiveProject({
  created,
  active,
  running,
  style,
}: Props) {
  const rows = [
    { type: "Actively being used", ...ZEROS, ...active },
    { type: "Created", ...ZEROS, "5min": "-", ...created },
  ];
  return (
    <div style={style}>
      <Title level={2}>Running Projects: {running.free + running.member}</Title>
      <Paragraph>
        There are {running.free + running.member} projects running right now.
        Track the number of projects that were actively being used and the
        number that were created below.
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
