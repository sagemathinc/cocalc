import { Input } from "antd";
import { redux } from "@cocalc/frontend/app-framework";

export default function Search({}) {
  const search = (query) => {
    const actions = redux.getActions("messages");
    actions?.search(query);
  };

  return (
    <Input.Search
      style={{ maxWidth: "500px", marginBottom: "15px" }}
      size="large"
      allowClear
      enterButton
      placeholder="Search messages..."
      onSearch={search}
      onChange={(e) => search(e.target.value)}
    />
  );
}
