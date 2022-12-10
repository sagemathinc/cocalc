import { webapp_client } from "@cocalc/frontend/webapp-client";
import { useEffect, useState } from "react";
import { Button, Table } from "antd";
import useCounter from "@cocalc/frontend/app-framework/counter-hook";
import { Icon, TimeAgo } from "@cocalc/frontend/components";
import { cmp_Date } from "@cocalc/util/cmp";
import { Avatar } from "@cocalc/frontend/account/avatar/avatar";
import StaticMarkdown from "@cocalc/frontend/editors/slate/static-markdown";

const QUERY = {
  crm_shopping_cart_items: [
    {
      id: null,
      account_id: null,
      added: null,
      removed: null,
      purchased: null,
      product: null,
      description: null,
      project_id: null,
    },
  ],
};

const columns = [
  {
    title: "Id",
    dataIndex: "id",
    key: "id",
  },
  {
    title: "Account",
    dataIndex: "account_id",
    key: "avatar",
    render: (account_id: string) => <Avatar account_id={account_id} />,
  },
  {
    title: "Added",
    dataIndex: "added",
    key: "added",
    sorter: (a, b) => cmp_Date(a.added, b.added),
    render: (_, { added }) => <TimeAgo date={added} />,
    ellipsis: true,
  },
  {
    title: "Removed",
    dataIndex: "removed",
    key: "removed",
    sorter: (a, b) => cmp_Date(a.removed, b.removed),
    render: (_, { removed }) => <TimeAgo date={removed} />,
    ellipsis: true,
  },
  {
    title: "Purchased",
    dataIndex: "purchased",
    key: "purchased",
    sorter: (a, b) => cmp_Date(a.purchased, b.purchased),
    render: (_, { purchased }) => {
      if (!purchased) return null;
      return (
        <div>
          License id: {purchased.license_id}
          <br />
          <TimeAgo date={purchased.time} />
        </div>
      );
    },
  },
  {
    title: "Product",
    dataIndex: "product",
    key: "product",
    ellipsis: true,
  },
  {
    title: "Project",
    dataIndex: "project_id",
    key: "project_id",
    ellipsis: true,
  },
];

async function getItems() {
  const v = await webapp_client.query_client.query({ query: QUERY });
  console.log("v = ", v);
  return v.query.crm_shopping_cart_items;
}

export default function ShoppingCartItems({}) {
  const [data, setItems] = useState<any>([]);
  const { val, inc } = useCounter();

  useEffect(() => {
    (async () => {
      setItems(await getItems());
    })();
  }, [val]);

  return (
    <Table
      rowKey="id"
      style={{ overflow: "auto", margin: "15px" }}
      dataSource={data}
      columns={columns}
      bordered
      title={() => (
        <>
          <b>
            <Icon name="shopping-cart" /> Shopping Cart Items
          </b>
          <Button onClick={inc} style={{ float: "right" }}>
            Refresh
          </Button>
        </>
      )}
      expandable={{
        expandedRowRender: ({ purchased, description }) => (
          <StaticMarkdown
            value={
              `#### License: ${purchased?.license_id}` +
              "\n#### Description\n\n```js\n" +
              JSON.stringify(description ?? {}, undefined, 2) +
              "\n```"
            }
          />
        ),
      }}
    />
  );
}
