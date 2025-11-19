import { client_db } from "@cocalc/util/schema";
import { webapp_client } from "@cocalc/frontend/webapp-client";
import { len, trunc_middle } from "@cocalc/util/misc";
import { redux } from "@cocalc/frontend/app-framework";
import { open_new_tab } from "../../misc/open-browser-tab";

const VIDEO_CHAT_SERVER = "https://meet.jit.si";
const VIDEO_UPDATE_INTERVAL_MS = 30 * 1000;

// Create pop-up window for video chat
function videoWindow(url: string) {
  return open_new_tab(url, true, { noopener: false });
}

const videoWindows = {};

export class VideoChat {
  private intervalId?: any;
  private project_id: string;
  private path: string;

  constructor({ project_id, path }: { project_id: string; path: string }) {
    this.project_id = project_id;
    this.path = path;
  }

  close = () => {
    // this.closeVideoChatWindow();
    delete this.intervalId;
  };

  weAreChatting = (): boolean => {
    const { account_id } = webapp_client;
    if (account_id == null) {
      return false;
    }
    const timestamp: Date | undefined = this.getUsers()?.[account_id];
    return (
      timestamp != null &&
      webapp_client.server_time().valueOf() - timestamp.valueOf() <=
        VIDEO_UPDATE_INTERVAL_MS
    );
  };

  numUsersChatting = (): number => {
    return len(this.getUsers());
  };

  getUserName = (): string | undefined => {
    const users = redux.getStore("users");
    const { account_id } = webapp_client;
    if (account_id == null) {
      return;
    }
    return users?.get_name(account_id);
  };

  getUserNames = (): string[] => {
    const users = redux.getStore("users");
    const v: string[] = [];
    for (const account_id in this.getUsers()) {
      const name = users.get_name(account_id)?.trim();
      if (name) {
        v.push(trunc_middle(name, 25));
      }
    }
    return v;
  };

  private getUsers = (): { [account_id: string]: Date } => {
    // Users is a map {account_id:timestamp of last chat file marking}
    return (
      redux.getStore("file_use")?.get_video_chat_users({
        project_id: this.project_id,
        path: this.path,
        ttl: 1.3 * VIDEO_UPDATE_INTERVAL_MS,
      }) ?? {}
    );
  };

  stopChatting = () => {
    this.closeVideoChatWindow();
  };

  startChatting = (actions) => {
    this.openVideoChatWindow();
    redux.getActions("file_use")?.mark_file(this.project_id, this.path, "chat");
    setTimeout(() => actions?.scrollToBottom(), 100);
    setTimeout(() => actions?.scrollToBottom(), 1000);
    return `[${this.getUserName()} joined Video Chat](${this.url()})`
  };

  // The canonical secret chatroom id.
  private chatroomId = (): string => {
    const secret_token = redux
      .getStore("projects")
      .getIn(["project_map", this.project_id, "secret_token"]);
    return client_db.sha1(secret_token, this.path);
  };

  url = (): string => {
    const room_id = this.chatroomId();
    return `${VIDEO_CHAT_SERVER}/${room_id}`;
  };

  // Open the video chat window, if it isn't already opened
  private openVideoChatWindow = (): void => {
    const room_id = this.chatroomId();
    if (videoWindows[room_id]) {
      return;
    }

    const chatWindowIsOpen = () => {
      return redux
        .getActions("file_use")
        ?.mark_file(this.project_id, this.path, "video", 0);
    };

    chatWindowIsOpen();
    this.intervalId = setInterval(
      chatWindowIsOpen,
      VIDEO_UPDATE_INTERVAL_MS * 0.8,
    );

    //const title = `CoCalc Video Chat: ${trunc_middle(this.path, 30)}`;
    const w = videoWindow(this.url());
    // https://github.com/sagemathinc/cocalc/issues/3648
    if (w == null) {
      return;
    }
    videoWindows[room_id] = w;
    // disabled -- see https://github.com/sagemathinc/cocalc/issues/1899
    //w.addEventListener "unload", =>
    //    @close_video_chat_window()
    // workaround for https://github.com/sagemathinc/cocalc/issues/1899
    const pollWindow = setInterval(() => {
      if (w.closed !== false) {
        // != is required for compatibility with Opera
        clearInterval(pollWindow);
        this.closeVideoChatWindow();
      }
    }, 1000);
  };

  // User wants to close the video chat window, but not via just clicking the
  // close button on the popup window
  private closeVideoChatWindow = (): void => {
    const room_id = this.chatroomId();
    const w = videoWindows[room_id];
    if (!w) {
      return;
    }
    redux
      .getActions("file_use")
      ?.mark_file(this.project_id, this.path, "video", 0, true, new Date(0));
    if (this.intervalId) {
      clearInterval(this.intervalId);
      delete this.intervalId;
    }
    delete videoWindows[room_id];
    w.close();
  };
}
