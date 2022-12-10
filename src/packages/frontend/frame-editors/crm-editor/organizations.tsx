import { webapp_client } from "@cocalc/frontend/webapp-client";
import { useEffect, useState } from "react";
import { Button, Space, Table } from "antd";
import useCounter from "@cocalc/frontend/app-framework/counter-hook";
import { TimeAgo } from "@cocalc/frontend/components";
import { cmp_Date } from "@cocalc/util/cmp";

import { EditableMarkdown, EditableText, EditableContext } from "./edit";

function organizationsQuery() {
  return {
    query: {
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
    },
  };
}

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
    defaultSortOrder: "descend" as "descend",
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

async function getOrganizations() {
  const v = await webapp_client.query_client.query(organizationsQuery());
  return v.query.crm_organizations.filter((x) => !x.deleted);
}

export default function Organizations({}) {
  const [data, setData] = useState<any[]>([]);
  const { val, inc } = useCounter();

  async function refresh() {
    const people = await getOrganizations();
    setData(people);
    inc();
  }

  useEffect(() => {
    refresh();
  }, []);

  async function addNew() {
    await webapp_client.query_client.query({
      query: {
        crm_organizations: { created: new Date(), last_edited: new Date() },
      },
    });
    await refresh();
    inc();
  }

  return (
    <EditableContext.Provider
      value={{ counter: val, table: "crm_organizations" }}
    >
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
