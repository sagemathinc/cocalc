import { useMemo, useState } from "react";
import { Input, Table } from "antd";
import Code from "components/landing/code";
import { debounce } from "lodash";
import executables, { Item } from "lib/landing/executables";

const COLUMNS = [
  {
    title: "Name",
    key: "name",
    dataIndex: "name",
    responsive: ["md" as any],
    render: (name) => <b style={{ fontSize: "12pt", color: "#666" }}>{name}</b>,
  },
  {
    title: "Path",
    key: "path",
    dataIndex: "path",
    render: (path) => <Code>{path}</Code>,
  },
  {
    title: "--version output",
    key: "output",
    dataIndex: "output",
    width: "40%",
    render: (output) => (
      <div
        style={{
          overflow: "scroll",
          maxHeight: "8em",
          maxWidth: "30vw",
          backgroundColor: "rgba(150, 150, 150, 0.1)",
          fontSize: "10px",
          border: "1px solid rgba(100, 100, 100, 0.2)",
          borderRadius: "3px",
        }}
      >
        <pre style={{ padding: "5px" }}>{output}</pre>
      </div>
    ),
  },
];

export default function ExecutablesTable() {
  const dataSource = useMemo(executables, []);
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
    <div>
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
