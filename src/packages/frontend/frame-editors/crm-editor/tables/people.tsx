import { Avatar } from "@cocalc/frontend/account/avatar/avatar";
import { TimeAgo } from "@cocalc/frontend/components";
import { cmp_Date } from "@cocalc/util/cmp";
import { EditableMarkdown, EditableText } from "../edit";
import { register } from "./tables";

register({
  name: "people",

  title: "People",

  query: {
    crm_people: [
      {
        id: null,
        last_edited: null,
        name: null,
        email_addresses: null,
        account_ids: null,
        deleted: null,
        notes: null,
        created: null,
      },
    ],
  },
  columns: [
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
  ],
  expandable: {
    expandedRowRender: ({ id, notes }) => (
      <EditableMarkdown id={id} field="notes" defaultValue={notes} />
    ),
  },
  allowCreate: true,
  changes: true,
});
