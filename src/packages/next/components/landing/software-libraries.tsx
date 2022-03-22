import { useMemo, useState } from "react";
import { Input, Table } from "antd";
import { debounce } from "lodash";
import A from "components/misc/A";
import {
  ComputeComponents,
  ComputeInventory,
  Item,
  LanguageName,
  SoftwareSpec,
} from "lib/landing/types";
import { getLibaries } from "lib/landing/get-libraries";

// check if the string is a URL
function isURL(url?: string) {
  return url && url.match(/^(http|https):\/\//);
}

export function renderName(name, record) {
  const url = record.url;
  return (
    <div>
      <b>{isURL(url) ? <A href={url}>{name}</A> : name}</b>
      <br />
      {record.summary}
    </div>
  );
}

interface Props {
  libWidthPct?: number;
  spec: SoftwareSpec[LanguageName];
  inventory: ComputeInventory[LanguageName];
  components: ComputeComponents[LanguageName];
}

export default function SoftwareLibraries(props: Props) {
  const { spec, inventory, components, libWidthPct = 60 } = props;
  const dataSource = getLibaries(spec, inventory, components);
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

  type Columns = {
    width: string;
    title: string;
    key: string;
    dataIndex: string;
    render?: typeof renderName;
  }[];

  const columns = useMemo((): Columns => {
    const envs = Object.entries(spec);
    const width = (100 - libWidthPct) / envs.length;

    const columns: Columns = [
      {
        width: `${libWidthPct}%`,
        title: "Library",
        key: "library",
        dataIndex: "name",
        render: renderName,
      },
    ];

    for (const [name, val] of envs) {
      columns.push({
        width: `${width}%`,
        title: val.name,
        key: name,
        dataIndex: name,
      });
    }

    return columns;
  }, [libWidthPct]);

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
