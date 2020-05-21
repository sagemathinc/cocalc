import { client_db } from "smc-util/schema";
import { alert_message } from "../../alerts";
import { webapp_client } from "../../webapp-client";
import { len, trunc_middle } from "smc-util/misc";
import { open_new_tab } from "../../misc-page/open-browser-tab";
import { redux } from "../../app-framework";

const VIDEO_CHAT_SERVER = "https://meet.jit.si";
const VIDEO_UPDATE_INTERVAL_MS = 30 * 1000;

// Create pop-up window for video chat
function video_window(url: string) {
  return open_new_tab(url, true);
}

const video_windows = {};

export class VideoChat {
  private video_interval_id: any;
  private project_id: string;
  private path: string;
  private account_id: string;

  constructor(project_id: string, path: string, account_id: string) {
    this.project_id = project_id;
    this.path = path;
    this.account_id = account_id;
  }

  public we_are_chatting(): boolean {
    const timestamp: Date | undefined = this.get_users()?.[this.account_id];
    return (
      timestamp != null &&
      webapp_client.server_time().valueOf() - timestamp.valueOf() <=
        VIDEO_UPDATE_INTERVAL_MS
    );
  }

  public num_users_chatting(): number {
    return len(this.get_users());
  }

  public get_user_names(): string[] {
    const users = redux.getStore("users");
    const v: string[] = [];
    for (const account_id in this.get_users()) {
      const name = users.get_name(account_id)?.trim();
      if (name) {
        v.push(trunc_middle(name, 25));
      }
    }
    return v;
  }

  private get_users(): { [account_id: string]: Date } {
    // Users is a map {account_id:timestamp of last chat file marking}
    return (
      redux.getStore("file_use")?.get_video_chat_users({
        project_id: this.project_id,
        path: this.path,
        ttl: 1.3 * VIDEO_UPDATE_INTERVAL_MS,
      }) ?? {}
    );
  }

  public stop_chatting() {
    this.close_video_chat_window();
  }

  public start_chatting() {
    redux.getActions("file_use")?.mark_file(this.project_id, this.path, "chat");
    this.open_video_chat_window();
  }

  // The canonical secret chatroom id.
  private chatroom_id(): string {
    const secret_token = redux
      .getStore("projects")
      .getIn(["project_map", this.project_id, "status", "secret_token"]);
    if (!secret_token) {
      alert_message({
        type: "error",
        message: "You MUST be a project collaborator -- video chat will fail.",
      });
    }
    return client_db.sha1(secret_token, this.path);
  }

  // Open the video chat window, if it isn't already opened
  public open_video_chat_window(): void {
    const room_id = this.chatroom_id();
    if (video_windows[room_id]) {
      return;
    }

    const chat_window_is_open = () => {
      return redux
        .getActions("file_use")
        ?.mark_file(this.project_id, this.path, "video", 0);
    };

    chat_window_is_open();
    this.video_interval_id = setInterval(
      chat_window_is_open,
      VIDEO_UPDATE_INTERVAL_MS * 0.8
    );

    //const title = `CoCalc Video Chat: ${trunc_middle(this.path, 30)}`;
    const url = `${VIDEO_CHAT_SERVER}/${room_id}`;
    const w = video_window(url);
    // https://github.com/sagemathinc/cocalc/issues/3648
    if (w == null) {
      return;
    }
    video_windows[room_id] = w;
    // disabled -- see https://github.com/sagemathinc/cocalc/issues/1899
    //w.addEventListener "unload", =>
    //    @close_video_chat_window()
    // workaround for https://github.com/sagemathinc/cocalc/issues/1899
    const poll_window = setInterval(() => {
      if (w.closed !== false) {
        // != is required for compatibility with Opera
        clearInterval(poll_window);
        this.close_video_chat_window();
      }
    }, 1000);
  }

  // User wants to close the video chat window, but not via just clicking the
  // close button on the popup window
  public close_video_chat_window(): void {
    const room_id = this.chatroom_id();
    const w = video_windows[room_id];
    if (!w) return;
    redux
      .getActions("file_use")
      ?.mark_file(this.project_id, this.path, "video", 0, true, new Date(0));
    clearInterval(this.video_interval_id);
    delete video_windows[room_id];
    w.close();
  }
}
