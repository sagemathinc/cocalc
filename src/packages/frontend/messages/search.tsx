import { Input } from "antd";
import { redux } from "@cocalc/frontend/app-framework";
import { useState } from "react";

export default function Search({ filter }) {
  const [value, setValue] = useState<string>("");
  const search = (query) => {
    setValue(query);
    const actions = redux.getActions("messages");
    actions?.search(query);
  };

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
