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
    render: (account_id: string) => <Avatar account_id={account_id} />,
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
  {
    title: "account_id",
    dataIndex: "account_id",
    key: "account_id",
    ellipsis: true,
  },
  {
    title: "Name",
    key: "name",
    render: (_, { first_name, last_name }) => (
      <>
        {first_name} {last_name}
      </>
    ),
  },
  { title: "Email", dataIndex: "email_address", key: "email_address" },
];

export default function Accounts({}) {
  return <DBTable title={"Accounts"} query={query} columns={columns} />;
}
