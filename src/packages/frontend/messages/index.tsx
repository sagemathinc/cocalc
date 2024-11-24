/*
Component to show all your messages.
*/

import { useEffect } from "react";
import { init } from "./redux";
import Main from "./main";
import { useTypedRedux } from "@cocalc/frontend/app-framework";
import { ConfigProvider, Empty, Spin } from "antd";
import type { Filter } from "./types";
export { isMessagesFilter } from "./types";
import Search from "./search";
import { FileContext } from "@cocalc/frontend/lib/file-context";
import SmartAnchorTag from "@cocalc/frontend/components/smart-anchor-tag";

interface Props {
  filter?: Filter;
  style?;
}

export default function Messages({ filter, style }: Props) {
  useEffect(() => {
    // ONLY initialize the state stuff if the actual messages
    // are displayed, to avoid  waste of resources/load
    init();
  }, []);

  const threads = useTypedRedux("messages", "threads");
  const messages = useTypedRedux("messages", "messages");
  const search = useTypedRedux("messages", "search");

  return (
    <FileContext.Provider value={{ AnchorTagComponent }}>
      <ConfigProvider renderEmpty={() => <Empty description={"No messages"} />}>
        <div
          style={{
            borderLeft: "1px solid #ccc",
            overflowY: "auto",
            paddingLeft: "15px",
            ...style,
          }}
          className="smc-vfill"
        >
          <Search />
          {threads == null || messages == null ? (
            <Spin />
          ) : (
            <Main
              messages={messages}
              threads={threads}
              filter={filter}
              search={search}
            />
          )}
        </div>
      </ConfigProvider>
    </FileContext.Provider>
  );
}

function AnchorTagComponent({ href, title, children, style }) {
  return (
    <SmartAnchorTag
      project_id={""}
      path={""}
      href={href}
      title={title}
      style={style}
    >
      {children}
    </SmartAnchorTag>
  );
}
