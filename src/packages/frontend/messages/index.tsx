/*
Component to show all your messages.
*/

import { useEffect, useState } from "react";
import { init } from "./redux";
import Main from "./main";
import { redux, useTypedRedux } from "@cocalc/frontend/app-framework";
import { ConfigProvider, Empty, Spin } from "antd";
import type { Filter } from "./types";
export { isMessagesFilter } from "./types";
import Search from "./search";
import { FileContext } from "@cocalc/frontend/lib/file-context";
import SmartAnchorTag from "@cocalc/frontend/components/smart-anchor-tag";
import { ComposeModal } from "./compose";
import ShowError from "@cocalc/frontend/components/error";
import KeyboardShortcuts from "./keyboard";

// This is a little trick so we can initialize the redux store *only* when
// the component is first mounted... which only happens if the user actually
// clicks to visits the notifications page, not on any load.  This reduces
// memory usage and server and network load.
export default function Messages(props) {
  const [initialized, setInitialized] = useState<boolean>(false);
  useEffect(() => {
    // ONLY initialize the state stuff if the actual messages
    // are displayed, to avoid  waste of resources/load
    init();
    setInitialized(true);
  }, []);

  return initialized ? <Messages0 {...props} /> : null;
}

interface Props {
  filter?: Filter;
  style?;
}
function Messages0({ filter, style }: Props) {
  useEffect(() => {
    // ONLY initialize the state stuff if the actual messages
    // are displayed, to avoid  waste of resources/load
    init();
  }, []);

  const threads = useTypedRedux("messages", "threads");
  const messages = useTypedRedux("messages", "messages");
  const search = useTypedRedux("messages", "search");
  const error = useTypedRedux("messages", "error");
  const jupyter_api_enabled = useTypedRedux("customize", "jupyter_api_enabled");

  return (
    <FileContext.Provider
      value={{ AnchorTagComponent, jupyterApiEnabled: jupyter_api_enabled }}
    >
      <ConfigProvider renderEmpty={() => <Empty description={"No messages"} />}>
        <KeyboardShortcuts />
        <div
          style={{
            overflowY: "auto",
            paddingLeft: "15px",
            ...style,
          }}
          className="smc-vfill"
        >
          <Search filter={filter} />
          <ComposeModal />
          <ShowError
            error={error}
            setError={(error) => redux.getActions("messages").setError(error)}
            style={{ margin: "15px" }}
          />
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
