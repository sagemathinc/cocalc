import { useEffect, useMemo, useRef, useState } from "react";
import { Select } from "antd";
import type { SelectProps } from "antd";
import { webapp_client } from "@cocalc/frontend/webapp-client";
import User from "./user";
import { throttle } from "lodash";
import { redux, useTypedRedux } from "@cocalc/frontend/app-framework";
import { cmp, search_match, search_split } from "@cocalc/util/misc";
import { is_valid_email_address as isValidEmailAddress } from "@cocalc/util/misc";
import { TimeAgo } from "@cocalc/frontend/components/time-ago";

const AVATAR_SIZE = 22;

function UserLabel({
  account_id,
  knownUsers,
  last_active,
}: {
  account_id: string;
  knownUsers;
  last_active?;
}) {
  const users = useTypedRedux("users", "user_map");
  return (
    <div
      style={{
        marginLeft: "5px",
        marginTop: "1px",
      }}
    >
      <User
        message={null}
        id={account_id}
        trunc={24}
        type="account"
        show_avatar
        avatarSize={AVATAR_SIZE}
        style={{ overflow: "hidden", textOverflow: "ellipsis", flex: 0.7 }}
        addonAfter={
          <span style={{ color: "#888", marginLeft: "10px" }}>
            {account_id == webapp_client.account_id
              ? "(me"
              : users?.get(account_id)?.get("collaborator")
                ? "(collaborator"
                : knownUsers.has(account_id)
                  ? "(messaged"
                  : "(unrelated"}
            {last_active ? (
              <span>
                , active <TimeAgo date={last_active} />)
              </span>
            ) : (
              ")"
            )}
          </span>
        }
      />
    </div>
  );
}

const handleSearch = throttle(
  async ({
    query,
    setData,
    knownUsers,
  }: {
    query: string;
    setData;
    knownUsers: Set<string>;
  }) => {
    const isEmail = query?.trim() && isValidEmailAddress(query?.trim());
    // todo -- worry more about sort order
    const terms = search_split(query?.toLowerCase() ?? "");
    const v: { value: string; label; last_active?: Date }[] = [];
    const store = redux.getStore("users");
    const user_map = store.get("user_map");
    for (const account_id of knownUsers) {
      const name = store.get_name(account_id) ?? "";
      if (!name || search_match(name.toLowerCase(), terms)) {
        const last_active = user_map.getIn([account_id, "last_active"]);
        v.push({
          value: account_id,
          label: (
            <UserLabel
              account_id={account_id}
              knownUsers={knownUsers}
              last_active={last_active}
            />
          ),
          last_active,
        });
      }
    }

    if (!query?.trim()) {
      sortLastActive(v);
      setData(v);
      return;
    }
    const select = await webapp_client.users_client.user_search({
      query,
      limit: 50,
    });
    const found = select
      .filter(({ account_id }) => isEmail || !knownUsers.has(account_id))
      .map((user) => {
        return {
          value: user.account_id,
          label: (
            <UserLabel account_id={user.account_id} knownUsers={knownUsers} />
          ),
          last_active: user_map.getIn([user.account_id, "last_active"]),
        };
      });
    const w = v.concat(found);
    sortLastActive(w);
    setData(w);
  },
  1000,
);

function sortLastActive(v) {
  v.sort(
    (a, b) =>
      -cmp(a.last_active?.valueOf() ?? 0, b.last_active?.valueOf() ?? 0),
  );
}

export default function SelectUser({
  placeholder,
  style,
  disabled,
  onChange,
  defaultValue,
  autoFocus,
  autoOpen,
}: {
  placeholder: string;
  style?;
  disabled?: boolean;
  onChange?: (users) => void;
  defaultValue?;
  autoFocus?: boolean;
  autoOpen?: number;
}) {
  const [open, setOpen] = useState<boolean>(false); // needed to do autoOpen
  const ref = useRef<any>(null);
  const users = useTypedRedux("users", "user_map");
  const messages = useTypedRedux("messages", "messages");
  const knownUsers = useMemo(() => {
    const known = new Set<string>();
    if (messages == null) {
      return known;
    }
    for (const [_, message] of messages) {
      known.add(message.get("from_id"));
      for (const id of message.get("to_ids")) {
        known.add(id);
      }
    }
    for (const account_id of users?.keySeq() ?? []) {
      known.add(account_id);
    }
    return known;
  }, [messages]);

  const [data, setData] = useState<SelectProps["options"]>([]);
  const [value, setValue] = useState<string[] | null>(
    defaultValue ? defaultValue : null,
  );

  useEffect(() => {
    if (defaultValue != null) {
      setData(
        defaultValue.map((account_id) => {
          return {
            value: account_id,
            label: (
              <UserLabel account_id={account_id} knownUsers={knownUsers} />
            ),
          };
        }),
      );
    } else {
      handleSearch({ query: "", setData, knownUsers });
    }
    if (ref.current && autoFocus) {
      ref.current.focus();
    }
    if (autoOpen) {
      // we also autoopen the selector, but ONLY after a delay, since
      // this component is often used in a modal, and that modal animates
      // into view, and it looks broken to have this open before the modal exists.
      setTimeout(() => {
        setOpen(true);
        handleSearch({ query: "", setData, knownUsers });
      }, autoOpen);
    }
  }, []);

  const handleChange = (account_ids: string[]) => {
    setValue(account_ids);
    onChange?.(account_ids);
    // change behavior from antd default to be like gmail, i.e., once you select the dropdown goes away
    // until you type more.
    setOpen(false);
  };

  return (
    <Select
      mode="multiple"
      open={open}
      onDropdownVisibleChange={(open) => setOpen(open)}
      ref={ref}
      disabled={disabled}
      allowClear
      showSearch
      value={value}
      placeholder={placeholder}
      style={{ width: "400px", ...style }}
      defaultActiveFirstOption={false}
      suffixIcon={null}
      filterOption={false}
      onSearch={(query) => handleSearch({ query, setData, knownUsers })}
      onChange={handleChange}
      notFoundContent={null}
      options={data}
    />
  );
}
