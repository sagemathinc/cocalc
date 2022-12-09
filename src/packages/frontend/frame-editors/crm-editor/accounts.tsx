import { webapp_client } from "@cocalc/frontend/webapp-client";
import { useEffect, useState } from "react";
import { Button, Table } from "antd";
import useCounter from "@cocalc/frontend/app-framework/counter-hook";
import { Avatar } from "@cocalc/frontend/account/avatar/avatar";

function accountQuery() {
  return {
    query: {
      crm_accounts: [
        {
          account_id: null,
          first_name: null,
          last_name: null,
          email_address: null,
        },
      ],
    },
  };
}

const columns = [
  {
    title: "Avatar",
    dataIndex: "account_id",
    key: "avatar",
    render: (account_id: string) => <Avatar account_id={account_id} />,
  },
  { title: "account_id", dataIndex: "account_id", key: "account_id" },
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
    <div style={{ overflow: "auto", margin: "15px" }}>
      <Button onClick={inc} style={{ float: "right" }}>
        Refresh
      </Button>
      <h1>CoCalc Accounts</h1>
      <Table
        dataSource={accounts}
        columns={columns}
        bordered
        title={() => "Accounts"}
      />
    </div>
  );
}
