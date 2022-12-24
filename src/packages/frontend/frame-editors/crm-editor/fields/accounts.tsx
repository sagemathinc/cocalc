import { ReactNode, useState } from "react";
import { render } from "./register";
import { Avatar } from "@cocalc/frontend/account/avatar/avatar";
import { Alert, Button, Input, Select, SelectProps, Space } from "antd";
import {
  user_search,
  User,
} from "@cocalc/frontend/frame-editors/generic/client";
import { useEditableContext } from "./context";

const AVATAR_SIZE = 18;

render({ type: "accounts" }, ({ field, obj, spec, viewOnly }) => {
  if (spec.type != "accounts") throw Error("bug");
  const account_ids = obj[field];
  if (!account_ids && viewOnly) return null;
  const v: ReactNode[] = [];
  for (const account_id of account_ids ?? []) {
    v.push(
      <Avatar key={account_id} account_id={account_id} size={AVATAR_SIZE} />
    );
  }
  if (!viewOnly && spec.editable) {
    v.push(
      <AddAccount
        key="add-account"
        obj={obj}
        field={field}
        account_ids={account_ids ?? []}
      />
    );
  }
  return <div>{v}</div>;
});

render({ type: "account" }, ({ field, obj }) => {
  const account_id = obj[field];
  if (!account_id) return null;
  return <Avatar key={account_id} account_id={account_id} size={AVATAR_SIZE} />;
});

function AddAccount({
  field,
  obj,
  account_ids,
}: {
  field: string;
  obj: object;
  account_ids: string[];
}) {
  const [error, setError] = useState<string>("");
  const [users, setUsers] = useState<User[] | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const { error: saveError, save } = useEditableContext<string[]>(field);
  return (
    <div>
      {(users == null || users.length == 0) && !error && (
        <Input.Search
          allowClear
          loading={loading}
          placeholder="Search accounts by first name, last name, or email address..."
          enterButton
          onSearch={async (value) => {
            setError("");
            setUsers(null);
            if (!value) {
              return;
            }
            setLoading(true);
            try {
              let users = await user_search({
                query: value.toLowerCase(), // backend assumes lower case
                admin: true,
                limit: 100,
              });
              // exclude any we have already
              if (account_ids.length > 0) {
                const x = new Set(account_ids);
                users = users.filter((user) => !x.has(user.account_id));
              }
              setUsers(users);
            } catch (err) {
              setError(`${err}`);
            } finally {
              setLoading(false);
            }
          }}
        />
      )}
      {error && <Alert message={error} type="error" />}
      {saveError && <Alert message={saveError} type="error" />}
      {users != null && (
        <Users
          users={users}
          addAccounts={(new_account_ids: string[]) => {
            setError("");
            setUsers(null);
            if (new_account_ids.length > 0) {
              save(obj, account_ids.concat(new_account_ids));
            }
          }}
        />
      )}
    </div>
  );
}

function Users({
  users,
  addAccounts,
}: {
  users: User[];
  addAccounts: (account_ids: string[]) => void;
}) {
  const [selected, setSelected] = useState<string[]>([]);
  if (users.length == 0) {
    return <div>No results</div>;
  }

  const options: SelectProps["options"] = [];
  for (const user of users) {
    options.push({
      label: (
        <div>
          <Avatar account_id={user.account_id} size={AVATAR_SIZE} />{" "}
          {user.email_address}
        </div>
      ),
      value: user.account_id,
    });
  }
  return (
    <div>
      <Space style={{ marginBottom: "5px" }}>
        <Button
          disabled={selected.length == 0}
          type="primary"
          onClick={() => {
            addAccounts(selected);
          }}
        >
          Add Selected
        </Button>
        <Button
          onClick={() => {
            addAccounts([]);
          }}
        >
          Cancel
        </Button>
      </Space>
      <Select
        open
        autoFocus
        mode="multiple"
        allowClear
        style={{ width: "100%" }}
        placeholder="Please select accounts to associate with this person"
        defaultValue={[]}
        onChange={setSelected}
        options={options}
      />
    </div>
  );
}
