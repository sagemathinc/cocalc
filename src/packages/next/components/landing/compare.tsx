import { Alert, Table } from "antd";
import A from "components/misc/A";
import DATA from "./compare.json";
import { Icon } from "@cocalc/frontend/components/icon";
import Contact from "components/landing/contact";
import { ReactNode } from "react";

interface Props {
  name?: string;
  disclaimer?: boolean;
  title?: ReactNode;
}
export default function Compare({ name, disclaimer, title }: Props) {
  const v: JSX.Element[] = [];
  for (const table of DATA) {
    if (name != null && table.name != name) continue;
    v.push(
      <ComparisonTable
        key={table.name}
        table={table}
        disclaimer={disclaimer}
        title={title}
      />
    );
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

// undefined = unknown
// null = "not applicable"
type SupportType = boolean | undefined | null;
type Support =
  | SupportType
  | string
  | { type?: SupportType; note?: string; link?: string };

interface TableData {
  title: string;
  link: string;
  products: { key: string; name: string; link?: string }[];
  rows: { [title_or_key: string]: Support }[];
}

function ComparisonTable({
  table,
  disclaimer,
  title,
}: {
  table: TableData;
  disclaimer?: boolean;
  title: ReactNode;
}) {
  const columns = [
    {
      title: "Feature",
      dataIndex: "feature",
      key: "feature",
      width: "25%",
    },
  ];
  for (const product of table.products) {
    columns.push({
      title: (product.link ? (
        <A href={product.link} alt="Link to information about this product">
          {product.name}
        </A>
      ) : (
        product.name
      )) as any,
      key: product.key,
      dataIndex: product.key,
      // @ts-ignore
      render: (support?: Support) => {
        if (support === undefined) {
          return (
            <Icon
              name="question-circle"
              style={{ color: "#888", fontSize: "20px" }}
            />
          );
        }
        if (typeof support == "boolean" || support === null) {
          return <SupportMarker type={support} />;
        }
        let type: SupportType;
        let note: string | undefined;
        let link: string | undefined = "";
        if (typeof support == "string") {
          type = true;
          note = support;
        } else {
          type = support.type;
          note = support.note;
          link = support.link;
        }
        return (
          <>
            <SupportMarker type={type} /> {type !== undefined && <br />}
            {note && (
              <span style={{ color: "#666", fontSize: "9pt" }}>{note}</span>
            )}
            {link && <A href={link}>{link}</A>}
          </>
        );
      },
      sorter: (a, b) => cmp(a[product.key], b[product.key]),
    });
  }
  return (
    <div
      style={{
        margin: "auto",
        padding: "30px",
        overflowX: "auto",
      }}
    >
      {title ? (
        title
      ) : (
        <h1 style={{ textAlign: "center" }}>
          {table.title}&nbsp;&nbsp;&nbsp;&nbsp;
          <A
            href={table.link}
            style={{ fontSize: "11pt" }}
            alt="Link to learn more about this"
          >
            learn more
          </A>
        </h1>
      )}
      <Table
        dataSource={table.rows}
        columns={columns}
        bordered
        pagination={false}
        rowKey={"feature"}
      />
      {disclaimer && <Disclaimer />}
    </div>
  );
}

function SupportMarker({ type }) {
  if (type === true) {
    return <Icon name="check" style={{ color: "green", fontSize: "20px" }} />;
  } else if (type === false) {
    return <Icon name="times" style={{ color: "red", fontSize: "20px" }} />;
  } else if (type === null) {
    return <span style={{ color: "#888" }}>N/A</span>;
  } else {
    return null;
  }
}

export function Disclaimer() {
  return (
    <Alert
      style={{ margin: "30px 10%" }}
      message=""
      description={
        <span style={{ fontSize: "10pt" }}>
          These comparisons were made in good faith; however, they may contain
          errors, since we know CoCalc better and the products are constantly
          improving. <Contact /> if anything looks wrong or incomplete!
        </span>
      }
      type="warning"
      showIcon
    />
  );
}
