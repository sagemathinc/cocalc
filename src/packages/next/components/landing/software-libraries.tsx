import { useMemo, useState } from "react";
import { Input, Table } from "antd";
import libraries, { Item, ProgramName } from "lib/landing/libraries";
import { debounce } from "lodash";
import A from "components/misc/A";

export function renderName(name, record) {
  return (
    <div>
      <b>{record.url ? <A href={record.url}>{name}</A> : name}</b>
      <br />
      {record.summary}
    </div>
  );
}

interface Props {
  prog: ProgramName;
  columns;
  maxWidth?: number;
}

export default function SoftwareLibraries({ prog, columns, maxWidth }: Props) {
  const dataSource = useMemo(() => libraries(prog, maxWidth), [prog, maxWidth]);
  const [search, setSearch] = useState<string>("");
  const onChange = useMemo(
    () =>
      debounce((e) => {
        setSearch(e.target.value);
      }, 500),
    []
  );

  let data: Item[];
  if (!search) {
    data = dataSource;
  } else {
    const s = search.toLowerCase();
    data = [];
    for (const x of dataSource) {
      if (x.search.includes(s)) {
        data.push(x);
      }
    }
  }

  return (
    <div>
      <h2>Showing {data.length} libraries</h2>
      <Input.Search
        style={{ padding: "0 30px 15px 0", width: "50%", minWidth: "300px" }}
        placeholder="Search..."
        allowClear
        onChange={onChange}
        onPressEnter={(e) => setSearch((e.target as any).value)}
      />
      <div style={{ overflowX: "auto", width: "100%" }}>
        <Table
          columns={columns}
          bordered
          pagination={false}
          rowKey={"index"}
          dataSource={data}
        />
      </div>
    </div>
  );
}
