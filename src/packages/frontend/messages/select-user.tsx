import { useEffect, useMemo, useRef, useState } from "react";
import { Select } from "antd";
import type { SelectProps } from "antd";
import { webapp_client } from "@cocalc/frontend/webapp-client";
import User from "./user";
import { throttle } from "lodash";
import { redux, useTypedRedux } from "@cocalc/frontend/app-framework";
import { search_match, search_split } from "@cocalc/util/misc";

const AVATAR_SIZE = 28;

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
    // todo -- worry about sort order
    const terms = search_split(query?.toLowerCase() ?? "");

    const v: { value: string; label }[] = [];
    for (const account_id of knownUsers) {
      const name = redux.getStore("users").get_name(account_id) ?? "";
      if (!name || search_match(name.toLowerCase(), terms)) {
        v.push({
          value: account_id,
          label: (
            <User
              id={account_id}
              type="account"
              show_avatar
              avatarSize={AVATAR_SIZE}
            />
          ),
        });
      }
    }

    if (!query?.trim()) {
      setData(v);
      return;
    }
    const select = await webapp_client.users_client.user_search({
      query,
      limit: 50,
    });
    const found = select
      .filter(({ account_id }) => !knownUsers.has(account_id))
      .map((user) => {
        return {
          value: user.account_id,
          label: (
            <User
              id={user.account_id}
              type="account"
              show_avatar
              avatarSize={AVATAR_SIZE}
            />
          ),
        };
      });

    setData(v.concat(found));
  },
  1000,
);

export default function SelectUser({
  placeholder,
  style,
  disabled,
  onChange,
  defaultValue,
  autoFocus,
}: {
  placeholder: string;
  style?;
  disabled?: boolean;
  onChange?: (user) => void;
  defaultValue?;
  autoFocus?: boolean;
}) {
  const ref = useRef<any>(null);
  const users = useTypedRedux("users", "user_map");
  const messages = useTypedRedux("messages", "messages");
  const knownUsers = useMemo(() => {
    const known = new Set<string>();
    if (messages == null) {
      return known;
    }
    for (const [_, message] of messages) {
      if (message.get("from_type") == "account") {
        known.add(message.get("from_id"));
      }
      if (message.get("to_type") == "account") {
        known.add(message.get("to_id"));
      }
    }
    for (const account_id of users?.keySeq() ?? []) {
      known.add(account_id);
    }
    return known;
  }, [messages]);

  const [data, setData] = useState<SelectProps["options"]>([]);
  const [value, setValue] = useState<string | null>(
    defaultValue ? defaultValue : null,
  );

  useEffect(() => {
    handleSearch({ query: defaultValue, setData, knownUsers });
    if (ref.current && autoFocus) {
      ref.current.focus();
    }
  }, []);

  const handleChange = (account_id: string) => {
    setValue(account_id);
    onChange?.(account_id);
  };

  return (
    <Select
      ref={ref}
      disabled={disabled}
      allowClear
      showSearch
      value={value}
      placeholder={placeholder}
      style={style}
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
