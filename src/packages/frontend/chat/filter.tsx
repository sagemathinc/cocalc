import { Input, Tooltip } from "antd";
import { useEffect, useMemo, useState } from "react";
import { debounce } from "lodash";

export default function Filter({ actions, search, style }) {
  const [value, setValue] = useState<string>(search ?? "");
  useEffect(() => {
    setValue(search);
  }, [search]);

  const debouncedSearch = useMemo(() => {
    return debounce(actions.setSearch, 200, {
      leading: false,
      trailing: true,
    });
  }, [actions]);

  return (
    <Tooltip
      title={
        !value ? (
          <>
            Show only threads that match this filter. Use /re/ for a regular
            expression, quotes, and dashes to negate.
          </>
        ) : undefined
      }
    >
      <Input.Search
        style={style}
        allowClear
        placeholder={"Filter threads..."}
        value={value}
        onChange={(e) => {
          setValue(e.target.value ?? "");
          debouncedSearch(e.target.value ?? "");
        }}
        onPressEnter={() => {
          debouncedSearch.cancel();
          actions.setSearch(value);
        }}
        onSearch={() => {
          debouncedSearch.cancel();
          actions.setSearch(value);
        }}
      />
    </Tooltip>
  );
}
