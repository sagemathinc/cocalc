import type { iThreads, Folder } from "./types";
import { Badge, List, Tooltip } from "antd";
import { MessageInThread } from "./message";
import type { Message as MessageType } from "@cocalc/util/db-schema/messages";
import { useState } from "react";
import { plural } from "@cocalc/util/misc";
import { isFromMe, isRead } from "./util";
import User from "./user";
import { redux } from "@cocalc/frontend/app-framework";

interface Props {
  thread_id?: number;
  threads: iThreads;
  folder: Folder;
  style?;
  defaultExpanded?: Set<number>;
}

export default function Thread({
  thread_id,
  threads,
  folder,
  style,
  defaultExpanded,
}: Props) {
  const [expanded, setExpanded] = useState<Set<number>>(() => {
    const expanded = new Set<number>();
    if (defaultExpanded != null) {
      for (const id of defaultExpanded) {
        expanded.add(id);
      }
    }
    if (folder == "search") {
      // auto-expand all matching results
      for (const id of redux.getStore("messages").get("search")) {
        expanded.add(id);
      }
    }
    if (thread_id != null) {
      const thread = threads.get(thread_id)?.toJS() as unknown as MessageType[];
      if (thread != null) {
        // expand each message that is not read:
        const ids = new Set<number>();
        for (const id of thread
          .filter((message) => !isRead(message))
          .map(({ id }) => id)) {
          ids.add(id);
          expanded.add(id);
        }
      }
    }
    return expanded;
  });

  if (!thread_id) {
    return null;
  }
  const thread = threads.get(thread_id)?.toJS() as unknown as
    | MessageType[]
    | null;
  if (thread == null) {
    return null;
  }
  return (
    <List
      style={style}
      bordered
      dataSource={thread.slice(0, thread.length - 1)}
      renderItem={(message) => (
        <List.Item>
          <MessageInThread
            message={message}
            threads={threads}
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
  style,
}: {
  thread_id?: number;
  threads: iThreads;
  style?;
}) {
  if (!thread_id) {
    return null;
  }
  const thread = threads.get(thread_id);
  const count = thread?.size;
  if (!count || count == 1) {
    return null;
  }
  return (
    <Tooltip
      mouseEnterDelay={0.5}
      title={() => {
        let from_me = 0;
        let from_other = 0;
        let other_id = "";
        for (const message of thread) {
          if (isFromMe(message.toJS())) {
            from_me += 1;
          } else {
            from_other += 1;
            other_id = message.get("from_id");
          }
        }
        const tip = `Thread contains ${count} ${plural(count, "message")} with ${from_me} from me`;
        if (from_other == 0) {
          return <>{tip}.</>;
        } else {
          return (
            <>
              {tip} and {from_other} from <User id={other_id} message={null} />.
            </>
          );
        }
      }}
    >
      <Badge style={style} count={count} color={"#aaa"} />
    </Tooltip>
  );
}
