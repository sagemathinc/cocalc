import { webapp_client } from "@cocalc/frontend/webapp-client";
import { useEffect, useState } from "react";
import { Button, Table } from "antd";
import useCounter from "@cocalc/frontend/app-framework/counter-hook";

function peopleQuery() {
  return {
    query: {
      crm_people: [
        {
          id: null,
          first_name: null,
          last_name: null,
          email_addresses: null,
          account_ids: null,
        },
      ],
    },
  };
}

const columns = [
  { title: "Id", dataIndex: "id", key: "id" },
  { title: "First Name", dataIndex: "first_name", key: "first_name" },
  { title: "Last Name", dataIndex: "last_name", key: "last_name" },
  { title: "Email", dataIndex: "email_addresses", key: "email_addresses" },
  { title: "Accounts", dataIndex: "account_ids", key: "account_ids" },
];

async function getPeople() {
  const v = await webapp_client.query_client.query(peopleQuery());
  return v.query.crm_people;
}

export default function People({}) {
  const [people, setPeople] = useState<any>([]);
  const { val, inc } = useCounter();

  useEffect(() => {
    (async () => {
      setPeople(await getPeople());
    })();
  }, [val]);

  async function addNew() {
    await webapp_client.query_client.query({
      query: { crm_people: { created: new Date() } },
    });
    inc();
  }

  return (
    <div style={{ overflow: "auto", margin: "15px" }}>
      <Button onClick={inc} style={{ float: "right" }}>
        Refresh
      </Button>
      <Button onClick={addNew} style={{ float: "right" }}>
        Add
      </Button>
      <h1>CoCalc People</h1>
      <Table
        dataSource={people}
        columns={columns}
        bordered
        title={() => "People"}
      />
    </div>
  );
}
