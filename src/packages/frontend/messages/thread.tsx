import type { Threads } from "./types";
import { List } from "antd";
import Message from "./message";
import { field_cmp } from "@cocalc/util/misc";
import type { Message as MessageType } from "@cocalc/util/db-schema/messages";

interface Props {
  thread_id?: number;
  threads: Threads;
  filter?;
}

export default function Thread({ thread_id, threads, filter }: Props) {
  if (thread_id == null) {
    return null;
  }
  const thread = threads[thread_id];
  if (thread == null) {
    return null;
  }

  return (
    <List
      bordered
      dataSource={thread.slice(0, thread.length - 1)}
      renderItem={(message) => (
        <List.Item style={{ background: "#f2f6fc" }}>
          <Message message={message} filter={filter} />
        </List.Item>
      )}
    />
  );
}

export function ThreadCount({ thread_id, threads }: Props) {
  if (thread_id == null) {
    return null;
  }
  const n = threads[thread_id];
  if (n == null) {
    return null;
  }
  return <span style={{ marginLeft: "15px" }}>{Object.keys(n).length}</span>;
}

// here messages and sentMessages are null or immutable maps from string version of message
// id to immutable map version of message.
// Returns threads map from thread_id to map from messages id to messages in that thread
// (target is null if message with given id is mysteriously missing)
export function getThreads({ messages, sentMessages }): Threads {
  const threads: Threads = {};

  const getMessage = (id: number): MessageType | null => {
    const k = `${id}`;
    const m = messages.get(k) ?? sentMessages.get(k);
    return (m?.toJS() as MessageType) || null;
  };

  const process = (message) => {
    const thread_id = message.get("thread_id");
    if (thread_id == null) {
      return;
    }
    const m = getMessage(message.get("id"));
    if (threads[thread_id] == null) {
      threads[thread_id] = [getMessage(thread_id), m].filter((x) => x != null);
    } else {
      if (m != null) {
        threads[thread_id].push(m);
      }
    }
  };

  messages?.map(process);
  sentMessages?.map(process);

  for (const thread_id in threads) {
    threads[thread_id].sort(field_cmp("created"));
  }

  return threads;
}
