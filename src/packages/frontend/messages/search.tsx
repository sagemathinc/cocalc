import { Input } from "antd";
import { redux } from "@cocalc/frontend/app-framework";
import { useEffect, useState } from "react";

export default function Search({ filter }) {
  const [value, setValue] = useState<string>("");
  const search = (query) => {
    setValue(query);
    const actions = redux.getActions("messages");
    actions?.search(query);
  };

  useEffect(() => {
    // reset on mount
    search("");
  }, []);

  useEffect(() => {
    // changing the filter to anything other than messages-search
    // clears the search.
    if (filter != "messages-search") {
      search("");
    }
  }, [filter]);

  return (
    <Input.Search
      value={value}
      status={filter == "messages-search" && !value ? "warning" : undefined}
      style={{ marginBottom: "10px" }}
      size="large"
      allowClear
      enterButton
      placeholder="Search messages..."
      onSearch={() => search(value)}
      onChange={(e) => {
        search(e.target.value);
      }}
    />
  );
}
