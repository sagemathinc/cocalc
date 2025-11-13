/*
 *  This file is part of CoCalc: Copyright © 2021 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Input, Table } from "antd";
import { debounce } from "lodash";
import { useMemo, useState } from "react";

import Code from "components/landing/code";
import { Text, Title } from "components/misc";
import executables, { Item } from "lib/landing/executables";
import { ComputeInventory } from "lib/landing/types";
import { SoftwareSpecTimestamp } from "./software-libraries";

const INFO_STYLE: React.CSSProperties = {
  overflow: "auto",
  maxHeight: "10em",
  maxWidth: "40vw",
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
    render: (output) => {
      return {
        props: { style: { padding: "0 0 1em 0" } },
        children: (
          <div style={INFO_STYLE}>
            <pre style={PRE_STYLE}>{output}</pre>
          </div>
        ),
      };
    },
  },
];

export default function ExecutablesTable({
  executablesSpec,
  timestamp,
}: {
  executablesSpec: ComputeInventory["executables"];
  timestamp: string;
}) {
  const dataSource = executables(executablesSpec);
  const [search, setSearch] = useState<string>("");
  const onChange = useMemo(
    () =>
      debounce((e) => {
        setSearch(e.target.value);
      }, 300),
    [],
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
      <Title level={2}>Showing {data.length} executables</Title>
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
      <SoftwareSpecTimestamp timestamp={timestamp} />
    </div>
  );
}
