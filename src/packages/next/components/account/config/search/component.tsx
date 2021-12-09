import { Input, List } from "antd";
import { useState } from "react";
import { Info } from "./entries";
import register from "../register";
import { search } from "../search/entries";
import A from "components/misc/A";
import { Icon } from "@cocalc/frontend/components/icon";
import { capitalize } from "@cocalc/util/misc";
import { useRouter } from "next/router";
import { join } from "path";

export default function Search() {
  const [results, setResults] = useState<Info[] | undefined>(undefined);
  const [value, setValue] = useState<string>("");
  const router = useRouter();

  function onSearch(value: string) {
    setResults(search(value));
  }

  return (
    <div>
      <Input.Search
        style={{ maxWidth: "60ex" }}
        placeholder="Search configuration options..."
        onSearch={onSearch}
        enterButton
        allowClear
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          onSearch(e.target.value);
        }}
        onPressEnter={() => {
          if (results != null && results.length > 0) {
            // visit first search result.
            router.push(join("/config", results[0].path));
            setValue("");
          }
        }}
      />
      <br />
      <br />
      {results != null && value.trim() && (
        <SearchResults results={results} onClick={() => setValue("")} />
      )}
    </div>
  );
}

register({
  path: "search/input",
  title: "Search",
  desc: "",
  icon: "search",
  Component: Search,
});

function SearchResults({
  results,
  onClick,
}: {
  results: Info[];
  onClick: Function;
}) {
  const router = useRouter();
  return (
    <List
      style={{ marginBottom: "15px" }}
      bordered
      itemLayout="horizontal"
      dataSource={results}
      renderItem={(item) => {
        const top = item.path.split("/")[0];
        return (
          <A
            title={item.title}
            onClick={() => {
              onClick();
              router.push(join("/config", item.path));
            }}
          >
            <List.Item style={{ borderBottom: "1px solid lightgrey" }}>
              <List.Item.Meta
                avatar={<Icon name={item.icon} style={{ fontSize: "16pt" }} />}
                title={
                  <>
                    {capitalize(top)} <Icon name="arrow-right" />{" "}
                    <span style={{ color: "darkblue" }}>{item.title}</span>
                  </>
                }
                description={item.desc}
              />
            </List.Item>
          </A>
        );
      }}
    />
  );
}
