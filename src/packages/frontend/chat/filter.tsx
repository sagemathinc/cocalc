import { Input } from "antd";
import { useCallback, useEffect, useMemo, useState } from "react";
import { debounce } from "lodash";

export default function Filter({ actions, search, style }) {
  const [value, setValue] = useState<string>(search ?? "");
  useEffect(() => {
    setValue(search);
  }, [search]);
  const doSearch = useCallback(
    (value: string) => {
      actions.setState({ search: value });
    },
    [actions],
  );
  const debouncedSearch = useMemo(
    () =>
      debounce(doSearch, 200, {
        leading: false,
        trailing: true,
      }),
    [actions],
  );

  return (
    <Input.Search
      style={style}
      allowClear
      placeholder={"Filter messages (use /re/ for regexp)..."}
      value={value}
      onChange={(e) => {
        setValue(e.target.value ?? "");
        debouncedSearch(e.target.value ?? "");
      }}
      onPressEnter={() => {
        debouncedSearch.cancel();
        doSearch(value);
      }}
      onSearch={() => {
        debouncedSearch.cancel();
        doSearch(value);
      }}
    />
  );
}
