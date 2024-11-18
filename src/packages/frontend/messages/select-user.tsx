import { useEffect, useState } from "react";
import { Select } from "antd";
import type { SelectProps } from "antd";
import { webapp_client } from "@cocalc/frontend/webapp-client";
import { User } from "@cocalc/frontend/users";
import { throttle } from "lodash";

const handleSearch = throttle(async (query: string, setData) => {
  const select = await webapp_client.users_client.user_search({
    query,
    limit: 50,
  });
  setData(
    select.map((user) => {
      return {
        value: user.account_id,
        label: (
          <User account_id={user.account_id} show_avatar avatarSize={20} />
        ),
      };
    }),
  );
}, 1000);

export default function SelectUser({
  placeholder,
  style,
  disabled,
  onChange,
  defaultValue,
}: {
  placeholder: string;
  style?;
  disabled?: boolean;
  onChange?: (user) => void;
  defaultValue?;
}) {
  const [data, setData] = useState<SelectProps["options"]>([]);
  const [value, setValue] = useState<string | null>(defaultValue ? defaultValue : null);

  useEffect(() => {
    if (!defaultValue) {
      return;
    }
    handleSearch(defaultValue, setData);
  }, []);

  const handleChange = (account_id: string) => {
    setValue(account_id);
    onChange?.(account_id);
  };

  console.log({ value, placeholder });

  return (
    <Select
      disabled={disabled}
      allowClear
      showSearch
      value={value}
      placeholder={placeholder}
      style={style}
      defaultActiveFirstOption={false}
      suffixIcon={null}
      filterOption={false}
      onSearch={(query) => handleSearch(query, setData)}
      onChange={handleChange}
      notFoundContent={null}
      options={data}
    />
  );
}
