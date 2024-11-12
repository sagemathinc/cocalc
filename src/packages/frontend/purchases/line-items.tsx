import { useMemo, useState } from "react";
import type { LineItem } from "@cocalc/util/stripe/types";
import { Button, Table } from "antd";
import { currency, plural } from "@cocalc/util/misc";

const LINE_ITEMS_COLUMNS = [
  {
    title: "Description",
    dataIndex: "description",
    key: "description",
  } as const,
  {
    title: "Amount",
    dataIndex: "amount",
    key: "amount",
    render: (amount) => (
      <div style={{ whiteSpace: "nowrap" }}>{currency(amount)}</div>
    ),
    align: "right",
  } as const,
];

const EXTRA_LINE_ITEMS_COLUMNS = [
  {
    title: "",
    dataIndex: "",
    key: "",
    width: "30%",
  } as const,
  {
    title: "",
    align: "right",
    dataIndex: "description",
    key: "description",
    render: (description, { bold }) => (
      <div
        style={{
          fontWeight: bold ? "bold" : undefined,
          fontSize: bold ? "13pt" : undefined,
        }}
      >
        {description}
      </div>
    ),
  } as const,
  {
    title: "",
    dataIndex: "amount",
    key: "amount",
    render: (amount, { bold }) => (
      <div
        style={{
          whiteSpace: "nowrap",
          fontWeight: bold ? "bold" : undefined,
          fontSize: bold ? "13pt" : undefined,
        }}
      >
        {currency(amount)}
      </div>
    ),
    align: "right",
  } as const,
];

export function LineItemsTable({
  lineItems,
  style,
}: {
  lineItems: LineItem[];
  style?;
}) {
  const { dataSource, extraDataSource } = useMemo(() => {
    let key = 1;
    const dataSource: any[] = [];
    const extraDataSource: any[] = [];
    for (const item of lineItems) {
      const x = { key, ...item };
      if (item.extra) {
        extraDataSource.push(x);
      } else {
        dataSource.push(x);
      }
      key += 1;
    }
    return { dataSource, extraDataSource };
  }, [lineItems]);

  return (
    <div style={style}>
      {dataSource.length > 0 && (
        <Table
          rowKey={"key"}
          pagination={false}
          dataSource={dataSource}
          columns={LINE_ITEMS_COLUMNS}
        />
      )}
      {extraDataSource.length > 0 && (
        <Table
          rowKey={"key"}
          pagination={false}
          dataSource={extraDataSource}
          columns={EXTRA_LINE_ITEMS_COLUMNS}
        />
      )}
    </div>
  );
}

export function LineItemsButton({ lineItems, style }: { lineItems?; style? }) {
  const [show, setShow] = useState<boolean>(false);
  const n = lineItems?.length ?? 0;
  if (n == 0) {
    return null;
  }
  if (!show) {
    return (
      <Button size="small" type="link" onClick={() => setShow(true)}>
        {n} {plural(n, "Line Item")}
      </Button>
    );
  }
  return (
    <div
      style={{
        display: "inline-block",
        maxWidth: "450px",
        width: "100%",
        ...style,
      }}
    >
      <Button size="small" type="link" onClick={() => setShow(false)}>
        Hide
      </Button>
      {show && <LineItemsTable lineItems={lineItems} />}
    </div>
  );
}
