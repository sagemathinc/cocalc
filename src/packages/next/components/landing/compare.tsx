import { Table } from "antd";
import A from "components/misc/A";
import data from "./compare.json";

export default function Compare() {
  const v: JSX.Element[] = [];
  for (const table of data) {
    v.push(<ComparisonTable table={table} />);
  }
  return <div style={{ background: "white", width: "100%" }}>{v}</div>;
}

function cmp(a, b) {
  a = `${a}`;
  b = `${b}`;
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

// string = limited/partial, and explains how.
type Support = true | false | string;

interface Table {
  title: string;
  link: string;
  products: { key: string; name: string; link: string }[];
  rows: { [title_or_key: string]: Support }[];
}

function ComparisonTable({ table }: { table: Table }) {
  const columns = [{ title: "Feature", dataIndex: "feature", key: "feature" }];
  for (const product of table.products) {
    columns.push({
      title: <A href={product.link}>{product.name}</A>,
      key: product.key,
      dataIndex: product.key,
      render: (support?: Support) => {
        if (support == null) return null;
        if (support === true) return "Yes";
        if (support === false) return "No";
        return <>{support}</>;
      },
      sorter: (a, b) => cmp(a[product.key], b[product.key]),
    });
  }
  console.log(table);
  return (
    <div
      style={{
        margin: "auto",
        padding: "30px",
        overflowX: "auto",
      }}
    >
      <h1>
        <A href={table.link}>{table.title}</A>
      </h1>
      <Table
        dataSource={table.rows}
        columns={columns}
        bordered
        pagination={false}
      />
    </div>
  );
}
