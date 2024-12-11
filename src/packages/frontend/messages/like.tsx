import type { Message as MessageType } from "@cocalc/util/db-schema/messages";
import { Icon } from "@cocalc/frontend/components/icon";
import {
  isLiked,
  likeCount,
  get,
  getThread,
  isLikedByMe,
  likedBy,
} from "./util";
import type { iThreads } from "./types";
import { redux } from "@cocalc/frontend/app-framework";
import useCommand from "./use-command";
import { Badge, Button, Tooltip } from "antd";
import User from "./user";

interface Props {
  message: MessageType;
  threads: iThreads;
  inThread?: boolean;
  style?;
  focused?: boolean;
}

async function markThread({ message, threads, liked }) {
  if (liked) {
    await redux
      .getActions("messages")
      .mark({ id: get(message, "id"), liked: true });
    return;
  }
  for (const m of getThread({ message, threads })) {
    if (isLiked(m)) {
      await redux
        .getActions("messages")
        .mark({ id: get(m, "id"), liked: false });
    }
  }
}

export default function Like({
  message,
  threads,
  inThread,
  style,
  focused,
}: Props) {
  const count = likeCount({ message, inThread, threads });
  const liked = count > 0;
  const byMe = isLikedByMe(message);
  useCommand({
    ["toggle-like"]: () => {
      if (focused) {
        markThread({ message, threads, liked: !liked });
      }
    },
  });

  const btn = (
    <Button
      style={{
        color: byMe ? "#555" : "#999",
        background: byMe ? "#fff" : undefined,
        fontSize: "16px",
        padding: "5px",
        marginLeft: "5px",
        ...style,
      }}
      type={byMe ? "dashed" : "text"}
      onClick={(e) => {
        e?.stopPropagation();
        const liked = !byMe;
        // always just message
        redux.getActions("messages").mark({ id: get(message, "id"), liked });
      }}
    >
      <span style={{ minWidth: "15px" }}>
        {liked ? (
          <Badge
            count={likeCount({ message, inThread, threads })}
            color="darkblue"
            size="small"
          />
        ) : undefined}
      </span>{" "}
      <Icon name={"thumbs-up"} />
    </Button>
  );
  if (!liked) {
    return btn;
  }
  return (
    <Tooltip
      placement="left"
      title={() => {
        return (
          <User
            show_avatar
            avatarSize={24}
            id={likedBy({ message, inThread, threads })}
            message={undefined}
          />
        );
      }}
    >
      {btn}
    </Tooltip>
  );
}
