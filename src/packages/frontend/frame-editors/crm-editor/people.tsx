import { webapp_client } from "@cocalc/frontend/webapp-client";
import { Button, Space, Table } from "antd";
import { Avatar } from "@cocalc/frontend/account/avatar/avatar";
import { TimeAgo } from "@cocalc/frontend/components";
import { cmp_Date } from "@cocalc/util/cmp";
import { EditableMarkdown, EditableText, EditableContext } from "./edit";
import DBTable from "./db-table";

const query = {
  crm_people: [
    {
      id: null,
      last_edited: null,
      name: null,
      email_addresses: null,
      account_ids: null,
      deleted: null,
      notes: null,
    },
  ],
};

const columns = [
  {
    title: "Name",
    dataIndex: "name",
    key: "name",
    render: (value, { id }) => {
      return (
        <EditableText key={id} id={id} field="name" defaultValue={value} />
      );
    },
  },
  {
    title: "Edited",
    ellipsis: true,
    dataIndex: "last_edited",
    key: "last_edited",
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

export default function People({}) {
  return (
    <DBTable
      view={"cards"}
      title={"People"}
      query={query}
      columns={columns}
      changes
      allowCreate
      expandable={{
        expandedRowRender: ({ id, notes }) => (
          <EditableMarkdown id={id} field="notes" defaultValue={notes} />
        ),
      }}
    />
  );
}
