import { webapp_client } from "@cocalc/frontend/webapp-client";
import { Button, Space, Table } from "antd";
import { Avatar } from "@cocalc/frontend/account/avatar/avatar";
import { TimeAgo } from "@cocalc/frontend/components";
import { cmp_Date } from "@cocalc/util/cmp";
import { EditableMarkdown, EditableText, EditableContext } from "./edit";
import { useTable } from "./table";

const QUERY = {
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
  const [data, refresh, editableContext] = useTable({
    query: QUERY,
    changes: true,
  });

  async function addNew() {
    await webapp_client.query_client.query({
      query: { crm_people: { created: new Date(), last_edited: new Date() } },
    });
    // just recreates the changefeed so new record gets found, since id is
    // assigned by backend and we don't even know it.
    refresh();
  }

  // console.log("People", data);
  //         scroll={{ y: "70vh" }}
  //         pagination={{ pageSize: 50 }}

  return (
    <EditableContext.Provider value={editableContext}>
      <Table
        size="middle"
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
