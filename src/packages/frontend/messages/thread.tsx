import type { iThreads } from "./types";
import { List } from "antd";
import { MessageInThread } from "./message";
import { field_cmp } from "@cocalc/util/misc";
import type { Message as MessageType } from "@cocalc/util/db-schema/messages";
import { useState } from "react";
import { List as iList, Map as iMap } from "immutable";

interface Props {
  thread_id?: number;
  threads: iThreads;
  filter?;
  style?;
}

export default function Thread({ thread_id, threads, filter, style }: Props) {
  const [showBody, setShowBody] = useState<number | null>(null);

  if (thread_id == null) {
    return null;
  }
  const thread = threads.get(thread_id)?.toJS();
  if (thread == null) {
    return null;
  }

  return (
    <List
      style={style}
      bordered
      dataSource={
        thread.slice(0, thread.length - 1) as unknown as MessageType[]
      }
      renderItem={(message) => (
        <List.Item>
          <MessageInThread
            message={message}
            filter={filter}
            showBody={message.id == showBody}
            setShowBody={setShowBody}
          />
        </List.Item>
      )}
    />
  );
}

export function ThreadCount({ thread_id, threads }: Props) {
  if (thread_id == null) {
    return null;
  }
  const thread = threads.get(thread_id);
  return <span style={{ marginLeft: "15px" }}>{thread?.size}</span>;
}

// TODO: getThreads could be made much more efficient...
//
// here messages and sentMessages are null or immutable maps from string version of message
// id to immutable map version of message.
// Returns threads map from thread_id to map from messages id to messages in that thread
// (target is null if message with given id is mysteriously missing)
export function getThreads({ messages, sentMessages }): iThreads {
  let threads: iThreads = iMap();

  const getMessage = (id: number) => {
    return messages?.get(id) ?? sentMessages?.get(id);
  };

  const process = (message) => {
    const thread_id = message.get("thread_id");
    if (thread_id == null) {
      return;
    }
    const m = getMessage(message.get("id"));
    const thread = threads.get(thread_id);
    if (thread == null) {
      threads = threads.set(
        thread_id,
        iList([getMessage(thread_id), m]).filter((x) => x != null),
      );
    } else {
      if (m != null) {
        threads = threads.set(thread_id, thread.push(m));
      }
    }
  };

  messages?.map(process);
  sentMessages?.map(process);

  for (const thread_id of threads.keySeq()) {
    const thread = threads.get(thread_id);
    if (thread != null) {
      threads.set(thread_id, thread.sort(field_cmp("created")));
    }
  }

  return threads;
}
