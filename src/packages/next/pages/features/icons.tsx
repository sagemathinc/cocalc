/* Show all our icons. */

import { Input } from "antd";
import { Icon, iconNames } from "@cocalc/frontend/components/icon";
import { useState } from "react";
import Head from "components/landing/head";

const { Search } = Input;

function icons(search) {
  search = search.toLowerCase();
  const v: JSX.Element[] = [];
  for (const name of iconNames) {
    if (!name.includes(search)) continue;
    v.push(
      <div key={name} style={{ display: "inline-block", width: "200px" }}>
        <span style={{ fontSize: "24pt", margin: "0 15px" }}>
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
      <Head title={"CoCalc Icons"} />
      <h1>CoCalc Icons</h1>
      <Search
        placeholder="Search..."
        allowClear
        onChange={(e) => setSearch(e.target.value.toLowerCase().trim())}
        style={{ width: 400 }}
      />
      <br />
      <br />
      {icons(search)}
    </div>
  );
}


