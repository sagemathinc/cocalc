import { Input } from "antd";
import { redux } from "@cocalc/frontend/app-framework";

export default function Search({}) {
  const search = (query) => {
    const actions = redux.getActions("messages");
    actions?.search(query);
  };

  return (
    <Input.Search
      style={{ marginBottom: "10px" }}
      size="large"
      allowClear
      enterButton
      placeholder="Search messages..."
      onSearch={search}
      onChange={(e) => search(e.target.value)}
    />
  );
}
