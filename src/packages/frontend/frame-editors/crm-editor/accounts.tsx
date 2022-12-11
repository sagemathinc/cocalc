import { Avatar } from "@cocalc/frontend/account/avatar/avatar";
import { TimeAgo } from "@cocalc/frontend/components";
import { cmp_Date } from "@cocalc/util/cmp";
import DBTable from "./db-table";

const query = {
  crm_accounts: [
    {
      account_id: null,
      first_name: null,
      last_name: null,
      email_address: null,
      last_active: null,
    },
  ],
};

const columns = [
  {
    title: "Account",
    dataIndex: "account_id",
    key: "avatar",
    render: (account_id: string, { first_name, last_name }) => (
      <>
        <Avatar account_id={account_id} /> {first_name} {last_name}
      </>
    ),
  },
  {
    title: "Active",
    dataIndex: "last_active",
    key: "last_active",
    defaultSortOrder: "descend" as "descend",
    sorter: (a, b) => cmp_Date(a.last_active, b.last_active),
    render: (_, { last_active }) => <TimeAgo date={last_active} />,
    ellipsis: true,
  },
  { title: "Email", dataIndex: "email_address", key: "email_address" },
  {
    title: "account_id",
    dataIndex: "account_id",
    key: "account_id",
    ellipsis: true,
  },
];

export default function Accounts({}) {
  return (
    <DBTable
      view={"cards"}
      title={"Accounts"}
      query={query}
      columns={columns}
    />
  );
}
