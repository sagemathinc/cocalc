/*
Component to show all your messages.
*/

import { Card } from "antd";
import ShowError from "@cocalc/frontend/components/error";
import { useEffect, useState } from "react";
import { init } from "./redux";
import MessagesList from "./list";
import { useTypedRedux } from "@cocalc/frontend/app-framework";

type Filter =
  | "messages-read"
  | "messages-saved"
  | "messages-unread"
  | "messages-all";

export function isMessagesFilter(filter: string): filter is Filter {
  return filter?.startsWith("messages-");
}

interface Props {
  filter?: Filter;
  style?;
}

export default function Messages({ filter, style }: Props) {
  const [error, setError] = useState<string>("");
  useEffect(() => {
    // ONLY initialize the state stuff if the actual messages
    // are displayed, to avoid significant waste of resources/load
    init();
  }, []);

  const messages = useTypedRedux("messages", "messages");

  return (
    <Card title={"Messages"} style={style}>
      <ShowError
        error={error}
        setError={setError}
        style={{ margin: "30px auto" }}
      />
      <MessagesList messages={messages} filter={filter} />
    </Card>
  );
}
