import type { Message as MessageType } from "@cocalc/util/db-schema/messages";
import { Icon } from "@cocalc/frontend/components/icon";
import { likeCount, get, isLikedByMe, likedBy } from "./util";
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

  const toggle = () => {
    // always just message seems clearest in my testing.  It's so, SO interesting hi "like" and "star" have
    // very different semantics?!
    redux.getActions("messages").mark({ id: get(message, "id"), liked: !byMe });
  };

  useCommand({
    ["toggle-like"]: () => {
      if (focused) {
        toggle();
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
        toggle();
        redux.getActions("messages");
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
