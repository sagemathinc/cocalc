import { Input } from "antd";
import { redux } from "@cocalc/frontend/app-framework";

export default function Search({}) {
  return (
    <Input.Search
      size="large"
      allowClear
      enterButton
      placeholder="Search messages..."
      onSearch={(search) => {
        const actions = redux.getActions("messages");
        actions?.search(search);
      }}
    />
  );
}
