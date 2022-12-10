import { webapp_client } from "@cocalc/frontend/webapp-client";
import { createContext, useContext, useEffect, useRef, useState } from "react";
import { Button, Input, Space, Table } from "antd";
import useCounter from "@cocalc/frontend/app-framework/counter-hook";
import { TimeAgo } from "@cocalc/frontend/components";
import { cmp_Date } from "@cocalc/util/cmp";
import MultiMarkdownInput from "@cocalc/frontend/editors/markdown-input/multimode";

const EditableContext = createContext<any>(null);

function orgsQuery() {
  return {
    query: {
      crm_organizations: [
        {
          id: null,
          last_edited: null,
          name: null,
          people_ids: null,
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

async function getOrganizations() {
  const v = await webapp_client.query_client.query(orgsQuery());
  return v.query.crm_organizations.filter((x) => !x.deleted);
}

export default function Organizations({}) {
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
            <MultiMarkdownInput
              value={notes}
              onChange={async (notes) => {
                const query = {
                  crm_organizations: {
                    id,
                    last_edited: new Date(),
                    notes,
                  },
                };
                await webapp_client.query_client.query({ query });
              }}
            />
          ),
        }}
        title={() => (
          <>
            <b>Organizations</b>
            <Space wrap style={{ float: "right" }}>
              <Button onClick={refresh}>Refresh</Button>
              <Button onClick={addNew}>Add</Button>
            </Space>
          </>
        )}
      />
    </EditableContext.Provider>
  );
}
