import { webapp_client } from "@cocalc/frontend/webapp-client";
import { useEffect, useState } from "react";
import { Button, Table } from "antd";
import useCounter from "@cocalc/frontend/app-framework/counter-hook";
import { Avatar } from "@cocalc/frontend/account/avatar/avatar";
import { TimeAgo } from "@cocalc/frontend/components";
import { cmp_Date } from "@cocalc/util/cmp";

function accountQuery() {
  return {
    query: {
      crm_accounts: [
        {
          account_id: null,
          first_name: null,
          last_name: null,
          email_address: null,
          last_active: null,
        },
      ],
    },
  };
}

const columns = [
  {
    title: "Account",
    dataIndex: "account_id",
    key: "avatar",
    render: (account_id: string) => <Avatar account_id={account_id} />,
  },
  {
    title: "Active",
    dataIndex: "last_active",
    key: "last_active",
    defaultSortOrder: "descend" as "descend",
    sorter: (a, b) => cmp_Date(a.last_active, b.last_active),
    render: (_, { last_active }) => <TimeAgo date={last_active} />,
    ellipsis: true,
  },
  {
    title: "account_id",
    dataIndex: "account_id",
    key: "account_id",
    ellipsis: true,
  },
  { title: "First Name", dataIndex: "first_name", key: "first_name" },
  { title: "Last Name", dataIndex: "last_name", key: "last_name" },
  { title: "Email", dataIndex: "email_address", key: "email_address" },
];

async function getAccounts() {
  const v = await webapp_client.query_client.query(accountQuery());
  return v.query.crm_accounts;
}

export default function Accounts({}) {
  const [accounts, setAccounts] = useState<any>([]);
  const { val, inc } = useCounter();

  useEffect(() => {
    (async () => {
      setAccounts(await getAccounts());
    })();
  }, [val]);

  return (
    <Table
      style={{ overflow: "auto", margin: "15px" }}
      dataSource={accounts}
      columns={columns}
      bordered
      title={() => (
        <>
          <b>Accounts</b>
          <Button onClick={inc} style={{ float: "right" }}>
            Refresh
          </Button>
        </>
      )}
    />
  );
}
