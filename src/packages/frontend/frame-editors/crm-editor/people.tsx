import { webapp_client } from "@cocalc/frontend/webapp-client";
import { useEffect, useRef, useState } from "react";
import { Button, Space, Table } from "antd";
import useCounter from "@cocalc/frontend/app-framework/counter-hook";
import { Avatar } from "@cocalc/frontend/account/avatar/avatar";
import { TimeAgo } from "@cocalc/frontend/components";
import { cmp_Date } from "@cocalc/util/cmp";
import MultiMarkdownInput from "@cocalc/frontend/editors/markdown-input/multimode";
import { cloneDeep } from "lodash";
import { EditableMarkdown, EditableText, EditableContext } from "./edit";

function peopleQuery() {
  return {
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
  };
}

const columns = [
  {
    title: "First Name",
    dataIndex: "first_name",
    key: "first_name",
    render: (value, { id }) => {
      return (
        <EditableText
          key={id}
          id={id}
          field="first_name"
          defaultValue={value}
        />
      );
    },
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
  const v = await webapp_client.query_client.query({ query: peopleQuery() });
  return v.query.crm_people.filter((x) => !x.deleted);
}

export default function People({}) {
  const [data, setData] = useState<any[]>([]);
  const { val, inc } = useCounter();
  const { val: disconnectCounter, inc: incDisconnectCounter } = useCounter();
  const refreshRef = useRef<(x?) => Promise<void>>(async () => {});

  refreshRef.current = async (x) => {
    // specific record changed
    for (let i = 0; i < data.length; i++) {
      if (data[i].id == x.id) {
        data[i] = { ...data[i], ...x };
        setData([...data]);
        inc();
        return;
      }
    }
  };

  useEffect(() => {
    const x = { id: "" };
    webapp_client.query_client.query({
      changes: true,
      query: peopleQuery(),
      cb: (err, resp) => {
        if (err == "disconnect") {
          incDisconnectCounter();
          return;
        }
        if (err) {
          // TODO: set some overall error state.
          console.warn(err);
          return;
        }
        // TODO: err handling, reconnect logic
        if (resp.action) {
          // change, e.g., insert or update or delete
          refreshRef.current(resp.new_val);
        } else {
          // initial response
          x.id = resp.id;
          setData(resp.query.crm_people.filter((x) => !x.deleted));
        }
      },
    });
    return () => {
      // clean up by cancelling the changefeed when
      // component unmounts
      if (x.id) {
        (async () => {
          try {
            await webapp_client.query_client.cancel(x.id);
          } catch (_err) {
            // many valid reasons to get error here.
          }
        })();
      }
    };
  }, [disconnectCounter]);

  async function addNew() {
    await webapp_client.query_client.query({
      query: { crm_people: { created: new Date(), last_edited: new Date() } },
    });
    // just recreates the changefeed so new record gets found, since id is
    // assigned by backend and we don't even know it.
    incDisconnectCounter();
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
              <Button onClick={incDisconnectCounter}>Refresh</Button>
            </Space>
          </>
        )}
      />
    </EditableContext.Provider>
  );
}
