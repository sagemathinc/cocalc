/*
 *  This file is part of CoCalc: Copyright © 2021 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { Input, List } from "antd";
import { join } from "path";
import { useState } from "react";

import { Icon } from "@cocalc/frontend/components/icon";
import { capitalize } from "@cocalc/util/misc";
import A from "components/misc/A";
import { useRouter } from "next/router";
import register from "../register";
import { Info, search } from "./entries";

interface Props {
  allowEmpty?: boolean; // if true allow empty search
}

export default function Search({ allowEmpty }: Props) {
  const [value, setValue] = useState<string>("");
  const [results, setResults] = useState<Info[]>(search(value, allowEmpty));
  const router = useRouter();

  function onSearch(value: string) {
    setResults(search(value));
  }

  return (
    <div>
      <Input.Search
        autoFocus={allowEmpty}
        style={{ maxWidth: "60ex" }}
        placeholder="Search all configuration options (use /re/ for regexp)..."
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
      {results != null && (allowEmpty || value.trim()) && (
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
  Component: () => <Search allowEmpty />,
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
      locale={{ emptyText: <>No results</> }}
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
                avatar={
                  item.icon ? (
                    <Icon name={item.icon} style={{ fontSize: "16pt" }} />
                  ) : undefined
                }
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
