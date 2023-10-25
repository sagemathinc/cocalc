import { Table } from "antd";
import { TimeAgo } from "@cocalc/frontend/components";
import { capitalize } from "@cocalc/util/misc";

export default function DetailedState({ detailed_state }) {
  // Convert the object into an array for dataSource
  let data: any[] = [];
  for (let key in detailed_state) {
    data.push({
      key,
      ...detailed_state[key],
    });
  }

  // Define columns
  const columns = [
    { title: "Component", dataIndex: "key", key: "key", render: toLabel },
    {
      title: "Status",
      dataIndex: "value",
      key: "value",
      render: toLabel,
    },
    {
      title: "Time",
      dataIndex: "time",
      key: "time",
      render: (date) => <TimeAgo date={date} />,
    },
    { title: "", dataIndex: "extra", key: "extra" },
  ];

  // Render the table
  return <Table dataSource={data} columns={columns} />;
}

function toLabel(name: string) {
  return name
    .split("-")
    .map((x) => capitalize(x))
    .join(" ");
}
