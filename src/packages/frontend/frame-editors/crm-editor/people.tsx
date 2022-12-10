import { webapp_client } from "@cocalc/frontend/webapp-client";
import { useEffect, useRef, useState } from "react";
import { Button, Space, Table } from "antd";
import useCounter from "@cocalc/frontend/app-framework/counter-hook";
import { Avatar } from "@cocalc/frontend/account/avatar/avatar";
import { TimeAgo } from "@cocalc/frontend/components";
import { cmp_Date } from "@cocalc/util/cmp";
import MultiMarkdownInput from "@cocalc/frontend/editors/markdown-input/multimode";

import { EditableMarkdown, EditableText, EditableContext } from "./edit";

function peopleQuery() {
  return {
    query: {
      crm_people: [
        {
          id: null,
          last_edited: null,
          first_name: null,
          last_name: null,
          email_addresses: null,
          account_ids: null,
          deleted: null,
          notes: null,
        },
      ],
    },
  };
}

const columns = [
  {
    title: "First Name",
    dataIndex: "first_name",
    key: "first_name",
    render: (value, { id }) => (
      <EditableText key={id} id={id} field="first_name" defaultValue={value} />
    ),
  },
  {
    title: "Last Name",
    dataIndex: "last_name",
    key: "last_name",
    render: (value, { id }) => (
      <EditableText key={id} id={id} field="last_name" defaultValue={value} />
    ),
  },
  {
    title: "Edited",
    ellipsis: true,
    dataIndex: "last_edited",
    key: "last_edited",
    defaultSortOrder: "descend" as "descend",
    sorter: (a, b) => cmp_Date(a.last_edited, b.last_edited),
    render: (_, { last_edited }) => <TimeAgo date={last_edited} />,
  },
  {
    title: "Email",
    dataIndex: "email_addresses",
    key: "email_addresses",
    render: (value, { id }) => (
      <EditableText
        key={id}
        id={id}
        defaultValue={value}
        field="email_addresses"
      />
    ),
  },
  {
    title: "Accounts",
    dataIndex: "account_ids",
    key: "accounts",
    render: (_, record) => {
      const { account_ids } = record;
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
  return v.query.crm_people.filter((x) => !x.deleted);
}

export default function People({}) {
  const [data, setData] = useState<any[]>([]);
  const { val, inc } = useCounter();

  async function refresh() {
    const people = await getPeople();
    setData(people);
    inc();
  }

  useEffect(() => {
    refresh();
  }, []);

  async function addNew() {
    await webapp_client.query_client.query({
      query: { crm_people: { created: new Date(), last_edited: new Date() } },
    });
    await refresh();
    inc();
  }

  return (
    <EditableContext.Provider value={{ counter: val, table: "crm_people" }}>
      <Table
        rowKey="id"
        style={{ overflow: "auto", margin: "15px" }}
        dataSource={data}
        columns={columns}
        bordered
        expandable={{
          expandedRowRender: ({ id, notes }) => (
            <EditableMarkdown id={id} field="notes" defaultValue={notes} />
          ),
        }}
        title={() => (
          <>
            <b>People</b>
            <Space wrap style={{ float: "right" }}>
              <Button onClick={addNew}>New</Button>
              <Button onClick={refresh}>Refresh</Button>
            </Space>
          </>
        )}
      />
    </EditableContext.Provider>
  );
}
