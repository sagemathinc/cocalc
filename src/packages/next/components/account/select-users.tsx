/*
SelectUsers of this Cocalc server.

Based on the example "Search and Select Users":
https://ant.design/components/select/#components-select-demo-select-users
*/

import {  useState, useRef, useMemo } from "react";
import { Select, Spin } from "antd";
import { SelectProps } from "antd/es/select";
import debounce from "lodash/debounce";
import useCustomize from "lib/use-customize";

interface Props {
  placeholder?: string;
}

export default function SelectUsers({ placeholder }: Props) {
  const { siteName } = useCustomize();
  const [value, setValue] = useState<UserValue[]>([]);

  return (
    <DebounceSelect
      mode="multiple"
      value={value}
      placeholder={placeholder ?? `Select ${siteName} users`}
      fetchOptions={fetchUserList}
      onChange={(newValue) => {
        setValue(newValue);
      }}
      style={{ width: "100%" }}
    />
  );
}

interface DebounceSelectProps
  extends Omit<SelectProps<any>, "options" | "children"> {
  fetchOptions: (search: string) => Promise<any[]>;
  debounceTimeout?: number;
}

function DebounceSelect({
  fetchOptions,
  debounceTimeout = 800,
  ...props
}: DebounceSelectProps) {
  const [fetching, setFetching] = useState(false);
  const [options, setOptions] = useState<any[]>([]);
  const fetchRef = useRef(0);

  const debounceFetcher = useMemo(() => {
    const loadOptions = (value: string) => {
      fetchRef.current += 1;
      const fetchId = fetchRef.current;
      setOptions([]);
      setFetching(true);

      fetchOptions(value).then((newOptions) => {
        if (fetchId !== fetchRef.current) {
          // for fetch callback order
          return;
        }

        setOptions(newOptions);
        setFetching(false);
      });
    };

    return debounce(loadOptions, debounceTimeout);
  }, [fetchOptions, debounceTimeout]);

  return (
    <Select
      labelInValue
      filterOption={false}
      onSearch={debounceFetcher}
      notFoundContent={fetching ? <Spin size="small" /> : null}
      {...props}
      options={options}
    />
  );
}

interface UserValue {
  label: string;
  value: string;
}

async function fetchUserList(username: string): Promise<UserValue[]> {
  console.log("fetching user", username);

  return fetch("https://randomuser.me/api/?results=5")
    .then((response) => response.json())
    .then((body) =>
      body.results.map(
        (user: {
          name: { first: string; last: string };
          login: { username: string };
        }) => ({
          label: `${user.name.first} ${user.name.last}`,
          value: user.login.username,
        })
      )
    );
}
