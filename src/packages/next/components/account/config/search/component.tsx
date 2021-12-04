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

register({
  path: "search/input",
  title: "Search",
  desc: "",
  icon: "search",
  Component: () => {
    const [results, setResults] = useState<Info[] | undefined>(undefined);

    function onSearch(value: string) {
      setResults(search(value));
    }

    return (
      <div>
        <Input.Search
          style={{ maxWidth: "60ex" }}
          placeholder="Search configuration..."
          onSearch={onSearch}
          enterButton
          allowClear
        />
        <br />
        <br />
        {results != null && <SearchResults results={results} />}
      </div>
    );
  },
});

function SearchResults({ results }: { results: Info[] }) {
  const router = useRouter();
  return (
    <List
      bordered
      itemLayout="horizontal"
      dataSource={results}
      renderItem={(item) => {
        const top = item.path.split("/")[0];
        return (
          <A
            title={item.title}
            onClick={() => {
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
