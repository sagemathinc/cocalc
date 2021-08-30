/* Show all our icons. */

import { Input, Space } from "antd";
import { Icon, IconName, iconNames } from "@cocalc/frontend/components/icon";
import { useState } from "react";

const { Search } = Input;

function icons(search) {
  search = search.toLowerCase();
  const v: JSX.Element[] = [];
  for (const name of iconNames) {
    if (!name.includes(search)) continue;
    v.push(
      <div>
        <span style={{ fontSize: "20pt", margin: "0 15px" }}>
          <Icon name={name} />
        </span>
        <span>{name}</span>
      </div>
    );
  }
  return v;
}

export default function Icons() {
  const [search, setSearch] = useState<string>("");
  return (
    <div style={{ margin: "60px" }}>
      <h1>CoCalc Icons</h1>
      <Search
        placeholder="Search..."
        allowClear
        onChange={(e) => setSearch(e.target.value)}
        style={{ width: 400 }}
      />
      <br/>
      <br/>
      {icons(search)}
    </div>
  );
}
