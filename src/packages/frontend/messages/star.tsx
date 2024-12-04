import type { Message as MessageType } from "@cocalc/util/db-schema/messages";
import { Icon } from "@cocalc/frontend/components/icon";
import { isInFolderThreaded, isStarred, get, getThread } from "./util";
import type { iThreads } from "./types";
import { redux } from "@cocalc/frontend/app-framework";

interface Props {
  message: MessageType;
  threads: iThreads;
  inThread?: boolean;
  style?;
}

function showAsStarred({ message, threads, inThread }) {
  return inThread
    ? isStarred(message)
    : isInFolderThreaded({
        message: { ...message, deleted: false },
        threads,
        folder: "starred",
      });
}

async function markThread({ message, threads, starred }) {
  if (starred) {
    // for starring, just star newest message
    await redux
      .getActions("messages")
      .mark({ id: get(message, "id"), starred: true });
    return;
  }
  // for unstarring, unstar everything in thread that is starred.
  for (const m of getThread({ message, threads })) {
    if (isStarred(m)) {
      await redux
        .getActions("messages")
        .mark({ id: get(m, "id"), starred: false });
    }
  }
}

export default function Star({ message, threads, inThread, style }: Props) {
  const starred = showAsStarred({ message, threads, inThread });
  return (
    <Icon
      onClick={(e) => {
        e?.stopPropagation();
        //setStarred(!starred);
        if (!inThread) {
          markThread({ message, threads, starred: !starred });
        } else {
          // just message
          redux
            .getActions("messages")
            .mark({ id: get(message, "id"), starred: !starred });
        }
      }}
      name={starred ? "star-filled" : "star"}
      style={{
        color: starred ? "#f4c867" : "#babec1",
        fontSize: "20px",
        ...style,
      }}
    />
  );
}
