import { webapp_client } from "@cocalc/frontend/webapp-client";
import { useEffect, useRef, useState } from "react";
import { Button, Input, Table } from "antd";
import useCounter from "@cocalc/frontend/app-framework/counter-hook";
import { Avatar } from "@cocalc/frontend/account/avatar/avatar";

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

function EditableText({
  value,
  onChange,
}: {
  value?: string;
  onChange?: (value: string) => void;
}) {
  const [edit, setEdit] = useState<boolean>(false);
  const ref = useRef<any>();

  if (edit) {
    return (
      <Input
        autoFocus
        ref={ref}
        defaultValue={value}
        onBlur={() => {
          onChange?.(ref.current.input.value);
          setEdit(false);
        }}
        onPressEnter={() => {
          onChange?.(ref.current.input.value);
          setEdit(false);
        }}
      />
    );
  } else {
    return (
      <div
        title="Click to edit"
        style={{ minWidth: "5em", minHeight: "2em", cursor: "text" }}
        onClick={() => setEdit(true)}
      >
        {value}
      </div>
    );
  }
}

const columns = [
  { title: "Id", dataIndex: "id", key: "id" },
  {
    title: "First Name",
    dataIndex: "first_name",
    key: "first_name",
    render: (value, record) => (
      <EditableText
        value={value}
        onChange={async (newValue) => {
          if (newValue != value) {
            await webapp_client.query_client.query({
              query: { crm_people: { id: record.id, first_name: newValue } },
            });
          }
        }}
      />
    ),
  },
  {
    title: "Last Name",
    dataIndex: "last_name",
    key: "last_name",
    render: (value, record) => (
      <EditableText
        value={value}
        onChange={async (newValue) => {
          if (newValue != value) {
            await webapp_client.query_client.query({
              query: { crm_people: { id: record.id, last_name: newValue } },
            });
          }
        }}
      />
    ),
  },
  {
    title: "Email",
    dataIndex: "email_addresses",
    key: "email_addresses",
    render: (value, record) => (
      <EditableText
        value={value}
        onChange={async (newValue) => {
          if (newValue != value) {
            await webapp_client.query_client.query({
              query: {
                crm_people: { id: record.id, email_addresses: newValue },
              },
            });
          }
        }}
      />
    ),
  },
  {
    title: "Accounts",
    dataIndex: "account_ids",
    key: "accounts",
    render: (_, { account_ids }) => {
      if (!account_ids) return null;
      const v: any[] = [];
      for (const account_id of account_ids) {
        v.push(<Avatar key={account_id} account_id={account_id} />);
      }
      return <div>{v}</div>;
    },
  },
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
