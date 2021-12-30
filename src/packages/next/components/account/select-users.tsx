/*
SelectUsers of this Cocalc server.

Inspired by https://ant.design/components/select/#components-select-demo-select-users
*/

import { ReactNode, useState, useRef, useMemo } from "react";
import { Alert, Select, Spin } from "antd";
import { SelectProps } from "antd/es/select";
import debounce from "lodash/debounce";
import apiPost from "lib/api/post";
import type { User } from "@cocalc/server/accounts/search";
import Timestamp from "components/misc/timestamp";
import Avatar from "components/account/avatar";

interface Props {
  placeholder?: string;
  exclude?: string[]; // account_ids to exclude from search
  onChange?: (account_ids: string[]) => void;
}

export default function SelectUsers({ exclude, placeholder, onChange }: Props) {
  const [value, setValue] = useState<UserValue[]>([]);

  return (
    <DebounceSelect
      exclude={new Set(exclude)}
      mode="multiple"
      value={value}
      placeholder={placeholder ?? `Email address or name or @username`}
      fetchOptions={fetchUserList}
      onChange={(newValue) => {
        setValue(newValue);
        onChange?.(newValue.map((x) => x.value));
      }}
      style={{ width: "100%" }}
    />
  );
}

interface DebounceSelectProps
  extends Omit<SelectProps<any>, "options" | "children"> {
  fetchOptions: (search: string, exclude?: Set<string>) => Promise<any[]>;
  debounceTimeout?: number;
  exclude?: Set<string>;
}

function DebounceSelect({
  exclude,
  fetchOptions,
  debounceTimeout = 800,
  ...props
}: DebounceSelectProps) {
  const [fetching, setFetching] = useState(false);
  const [error, setError] = useState<string>("");
  const [options, setOptions] = useState<any[]>([]);
  const fetchRef = useRef(0);

  const debounceFetcher = useMemo(() => {
    const loadOptions = async (value: string) => {
      fetchRef.current += 1;
      const fetchId = fetchRef.current;
      setError("");
      setFetching(true);

      try {
        const newOptions = await fetchOptions(value, exclude);
        if (fetchId == fetchRef.current) {
          setOptions(newOptions);
        }
      } catch (err) {
        setError(err.message);
      } finally {
        setFetching(false);
      }
    };

    return debounce(loadOptions, debounceTimeout);
  }, [fetchOptions, debounceTimeout]);

  return (
    <>
      {error && (
        <Alert type="error" message={error} style={{ marginBottom: "15px" }} />
      )}
      <Select
        labelInValue
        filterOption={false}
        onSearch={debounceFetcher}
        notFoundContent={fetching ? <Spin size="small" /> : null}
        {...props}
        options={options}
      />
    </>
  );
}

interface UserValue {
  label: ReactNode;
  value: string;
}

async function fetchUserList(
  query: string,
  exclude?: Set<string>
): Promise<UserValue[]> {
  const v: User[] = await apiPost("/accounts/search", { query });
  const list: UserValue[] = [];
  for (const user of v) {
    if (exclude?.has(user.account_id)) continue;
    list.push({
      label: <Label {...user} />,
      value: user.account_id,
    });
  }
  return list;
}

function Label({
  account_id,
  first_name,
  last_name,
  last_active,
  created,
  name,
}: User) {
  return (
    <div style={{ borderBottom: "1px solid lightgrey", paddingBottom: "5px" }}>
      <Avatar
        account_id={account_id}
        size={18}
        style={{ marginRight: "5px" }}
      />
      {first_name} {last_name}
      {name ? ` (@${name})` : ""}
      {last_active && (
        <div>
          Last Active: <Timestamp epoch={last_active} />
        </div>
      )}
      {created && (
        <div>
          Created: <Timestamp epoch={created} />
        </div>
      )}
    </div>
  );
}
