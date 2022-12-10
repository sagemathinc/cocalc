import { webapp_client } from "@cocalc/frontend/webapp-client";
import { Button, Space, Table } from "antd";
import { TimeAgo } from "@cocalc/frontend/components";
import { cmp_Date } from "@cocalc/util/cmp";
import { EditableMarkdown, EditableText, EditableContext } from "./edit";
import { useTable } from "./changefeed";

const QUERY = {
  crm_organizations: [
    {
      id: null,
      last_edited: null,
      name: null,
      people_ids: null,
      organization_ids: null,
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
    render: (value, { id }) => (
      <EditableText key={id} id={id} field="name" defaultValue={value} />
    ),
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
    title: "People",
    dataIndex: "people_ids",
    key: "accounts",
    render: (_, record) => {
      return <>{JSON.stringify(record.people_ids)}</>;
    },
  },
  {
    title: "Organizations",
    dataIndex: "organization_ids",
    key: "organization_ids",
    render: (_, record) => {
      return <>{JSON.stringify(record.organization_ids)}</>;
    },
  },
];

export default function Organizations({}) {
  const [data, refresh, editableContext] = useTable({ query: QUERY });

  async function addNew() {
    await webapp_client.query_client.query({
      query: {
        crm_organizations: { created: new Date(), last_edited: new Date() },
      },
    });
    refresh();
  }

  return (
    <EditableContext.Provider value={editableContext}>
      <Table
        rowKey="id"
        style={{ overflow: "auto", margin: "15px" }}
        dataSource={data}
        columns={columns}
        bordered
        expandable={{
          expandedRowRender: ({ id, notes }) => (
            <EditableMarkdown field="notes" id={id} defaultValue={notes} />
          ),
        }}
        title={() => (
          <>
            <b>Organizations</b>
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
