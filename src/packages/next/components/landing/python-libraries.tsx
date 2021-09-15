import { useMemo, useState } from "react";
import { Input, Table } from "antd";
import A from "components/misc/A";
import DATA from "dist/compute-inventory.json";
import DETAILS from "dist/compute-components.json";
import { field_cmp, trunc } from "@cocalc/util/misc";
const { python: python_inventory } = DATA;
const { python: python_details } = DETAILS;

import { debounce } from "lodash";

interface Item {
  name: string;
  key: string;
  url?: string;
  summary?: string;
  python3?: string;
  sage?: string;
  anaconda?: string;
  python2?: string;
  search: string;
}

const python3 = python_inventory["/usr/bin/python3"];
const python2 = python_inventory["/usr/bin/python2"];
const sage = python_inventory["sage -python"];
const anaconda = python_inventory["/ext/anaconda2020.02/bin/python"];

const dataSource: Item[] = [];

const width = 15;

for (const name in python_details) {
  const { url, summary } = python_details[name] ?? {};
  dataSource.push({
    name,
    key: name.toLowerCase(),
    summary,
    url,
    search: (name + (summary ?? "")).toLowerCase(),
    python3: trunc(python3[name], width),
    sage: trunc(sage[name], width),
    anaconda: trunc(anaconda[name], width),
    python2: trunc(python2[name], width),
  });
}

dataSource.sort(field_cmp("key"));

const COLUMNS = [
  {
    width: "40%",
    title: "Library",
    key: "library",
    dataIndex: "name",
    render: (name, record) => (
      <div>
        <b>{record.url ? <A href={record.url}>{name}</A> : name}</b>
        <br />
        {record.summary}
      </div>
    ),
  },
  {
    width: "15%",
    title: "Python 3",
    key: "python3",
    dataIndex: "python3",
  },
  {
    width: "15%",
    title: "SageMath",
    key: "sage",
    dataIndex: "sage",
  },
  {
    width: "15%",
    title: "Anaconda 2020",
    key: "anaconda",
    dataIndex: "anaconda",
  },
  {
    width: "15%",
    title: "Python 2",
    key: "python2",
    dataIndex: "python2",
  },
];

export default function ExecutablesTable() {
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
