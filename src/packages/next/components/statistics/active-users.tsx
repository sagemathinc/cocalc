import { Table } from "antd";
import { HistoricCounts } from "@cocalc/util/db-schema/stats";
import { ZEROS } from "./misc";

interface Props {
  active: HistoricCounts;
  created: HistoricCounts;
  hubServers: { host: string; clients: number }[];
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

export default function ActiveUsers({ created, active, hubServers }: Props) {
  const rows = [
    { type: "In use", ...ZEROS, ...active },
    { type: "Created", ...ZEROS, ...created },
  ];
  return (
    <div>
      <h2>Active Users: {active["5min"]}</h2>
      <p>
        There are {connectedUsers(hubServers)} users connected right now, of
        which {active["5min"]} actively edited a file in the last 5 minutes.
        Track the number of users that were recently active or created accounts
        below.
      </p>

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
