import { Button, Popover } from "antd";
import { debounce } from "lodash";
import type { CSSProperties, ReactNode } from "react";
import { useMemo } from "react";
import { useInterval } from "react-interval-hook";
import type { ChatActions } from "../actions";
import { React, useState, useTypedRedux } from "@cocalc/frontend/app-framework";
import { Icon } from "@cocalc/frontend/components";

const VIDEO_UPDATE_INTERVAL_MS = 30 * 1000;
// jit.si doesn't seem to have a limit...?
const VIDEO_CHAT_LIMIT = 99999;

interface Props {
  actions: ChatActions;
  style?: CSSProperties;
  label?: ReactNode;
}

export default function VideoChatButton({
  actions,
  style: style0,
  label,
}: Props) {
  // to know if somebody else has video chat opened for this file
  // @ts-ignore
  const file_use = useTypedRedux("file_use", "file_use");

  const [counter, set_counter] = useState<number>(0); // to force updates periodically.
  useInterval(() => set_counter(counter + 1), VIDEO_UPDATE_INTERVAL_MS / 2);
  const videoChat = useMemo(
    () => actions.frameTreeActions?.getVideoChat(),
    [actions],
  );

  if (videoChat == null) {
    // eg sage worksheets...
    return null;
  }

  const click_video_button = debounce(
    () => {
      if (videoChat.weAreChatting()) {
        // we are chatting, so stop chatting
        videoChat.stopChatting();
      } else {
        videoChat.startChatting(); // not chatting, so start
        actions.sendChat({
          input: `${
            videoChat.getUserName() ?? "User"
          } joined [the video chat](${videoChat.url()}).`,
        });
      }
    },
    750,
    { leading: true },
  );

  function render_num_chatting(
    num_users_chatting: number,
  ): React.JSX.Element | undefined {
    if (num_users_chatting > 0) {
      return (
        <span>
          <hr />
          There following {num_users_chatting} people are using video chat:
          <br />
          {videoChat?.getUserNames().join(", ")}
        </span>
      );
    }
  }

  function render_join(num_users_chatting: number): React.JSX.Element {
    if (videoChat?.weAreChatting()) {
      return (
        <span>
          <b>Leave</b> this video chatroom.
        </span>
      );
    } else {
      if (num_users_chatting < VIDEO_CHAT_LIMIT) {
        return (
          <span>
            {num_users_chatting == 0 ? "Start a new " : "Join the current"}{" "}
            video chat.
          </span>
        );
      } else {
        return (
          <span>
            At most {VIDEO_CHAT_LIMIT} people can use the video chat at once.
          </span>
        );
      }
    }
  }

  const num_users_chatting: number = videoChat?.numUsersChatting() ?? 0;
  const style: React.CSSProperties = { cursor: "pointer" };
  if (num_users_chatting > 0) {
    style.color = "#c9302c";
  }

  const body = (
    <>
      <Icon name="video-camera" />
      {num_users_chatting > 0 && (
        <span style={{ marginLeft: "5px" }}>{num_users_chatting}</span>
      )}
      <span style={{ marginLeft: "5px" }}>{label ?? "Video Chat"}</span>
    </>
  );

  const btn = (
    <Button onClick={click_video_button} style={{ ...style, ...style0 }}>
      {body}
    </Button>
  );

  return (
    <Popover
      mouseEnterDelay={0.8}
      title={() => (
        <span>
          {render_join(num_users_chatting)}
          {render_num_chatting(num_users_chatting)}
        </span>
      )}
    >
      {btn}
    </Popover>
  );
}
