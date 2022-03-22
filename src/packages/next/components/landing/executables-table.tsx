import { useMemo, useState } from "react";
import { Input, Table, Typography } from "antd";
import Code from "components/landing/code";
import { debounce } from "lodash";
import executables, { Item } from "lib/landing/executables";
import { ComputeInventory } from "lib/landing/types";
const { Text } = Typography;

const INFO_STYLE: React.CSSProperties = {
  overflow: "auto",
  maxHeight: "10em",
  maxWidth: "30vw",
  backgroundColor: "rgba(150, 150, 150, 0.1)",
  fontSize: "10px",
  border: "none",
  borderRadius: "3px",
} as const;

const PRE_STYLE: React.CSSProperties = {
  padding: "5px",
  margin: 0,
  overflow: "unset", // parent div will show scroll handles
} as const;

const COLUMNS = [
  {
    title: "Name",
    key: "name",
    dataIndex: "name",
    responsive: ["md" as any],
    render: (name) => (
      <Text strong style={{ fontSize: "12pt" }}>
        {name}
      </Text>
    ),
  },
  {
    title: "Path",
    key: "path",
    dataIndex: "path",
    render: (path) => <Code>{path}</Code>,
  },
  {
    title: "Information",
    key: "output",
    dataIndex: "output",
    width: "40%",
    render: (output) => (
      <div style={INFO_STYLE}>
        <pre style={PRE_STYLE}>{output}</pre>
      </div>
    ),
  },
];

export default function ExecutablesTable({
  executablesSpec,
}: {
  executablesSpec: ComputeInventory["executables"];
}) {
  const dataSource = executables(executablesSpec);
  const [search, setSearch] = useState<string>("");
  const onChange = useMemo(
    () =>
      debounce((e) => {
        setSearch(e.target.value);
      }, 300),
    []
  );

  let data: Item[];
  if (!search) {
    data = dataSource;
  } else {
    const s = search.toLowerCase();
    data = [];
    for (const x of dataSource) {
      if (x.path.includes(s)) {
        data.push(x);
      }
    }
  }

  return (
    <div style={{ clear: "both" }}>
      <h2>Showing {data.length} executables</h2>
      <Input.Search
        style={{ padding: "0 30px 15px 0", width: "50%", minWidth: "300px" }}
        placeholder="Search..."
        allowClear
        onChange={onChange}
        onPressEnter={(e) => setSearch((e.target as any).value)}
      />
      <div style={{ overflowX: "auto", width: "100%" }}>
        <Table
          columns={COLUMNS}
          bordered
          pagination={false}
          rowKey={"path"}
          dataSource={data}
        />
      </div>
    </div>
  );
}
