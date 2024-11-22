import type { iThreads, Folder } from "./types";
import { List } from "antd";
import { MessageInThread } from "./message";
import type { Message as MessageType } from "@cocalc/util/db-schema/messages";
import { useState } from "react";

interface Props {
  thread_id?: number;
  threads: iThreads;
  folder: Folder;
  style?;
}

export default function Thread({ thread_id, threads, folder, style }: Props) {
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

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
            folder={folder}
            showBody={expanded.has(message.id)}
            setShowBody={(add) => {
              if (add) {
                expanded.add(message.id);
              } else {
                expanded.delete(message.id);
              }
              setExpanded(new Set(expanded));
            }}
          />
        </List.Item>
      )}
    />
  );
}

export function ThreadCount({
  thread_id,
  threads,
}: {
  thread_id?: number;
  threads: iThreads;
}) {
  if (thread_id == null) {
    return null;
  }
  const thread = threads.get(thread_id);
  return <span style={{ marginLeft: "15px" }}>{thread?.size}</span>;
}
