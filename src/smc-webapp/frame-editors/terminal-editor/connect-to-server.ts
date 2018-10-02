/*
Connect the term.js terminal object to the backend terminal session with the given path.
*/

import { aux_file } from "../frame-tree/util";
import { project_websocket, touch } from "../generic/client";
import { reuseInFlight } from "async-await-utils/hof";

const MAX_HISTORY_LENGTH = 100 * 5000;

export async function connect_to_server(
  project_id: string,
  path: string,
  terminal: any,
  number: number
): Promise<void> {

  touch_path(project_id, path);
  path = aux_file(`${path}-${number}`, "term");
  terminal.is_paused = false;
  terminal.path = path;

  let conn; // connection to project -- the primus channel.

  terminal.ignore_terminal_data = true;

  async function handle_data_from_project(data) {
    if (typeof data === "string") {
      if (terminal.is_paused && !terminal.ignore_terminal_data) {
        render_buffer += data;
      } else {
        render(data);
      }
    } else if (typeof data === "object") {
      terminal.emit("mesg", data);
    }
  }

  let render_buffer: string = "";
  let history: string = "";
  function render(data: string): void {
    history += data;
    if (history.length > MAX_HISTORY_LENGTH) {
      history = history.slice(
        history.length - Math.round(MAX_HISTORY_LENGTH / 1.5)
      );
    }
    terminal.write(data);
  }

  terminal.pause = function(): void {
    terminal.is_paused = true;
  };

  terminal.unpause = function(): void {
    terminal.is_paused = false;
    render(render_buffer);
    render_buffer = "";
  };

  terminal.on("data", function(data) {
    if (terminal.ignore_terminal_data) {
      return;
    }
    terminal.conn_write(data);
  });

  terminal.conn_write = function(data) {
    if (conn === undefined) {
      // currently re-connecting.
      console.warn("ignoring write due to not conn", data);
      return;
    }
    conn.write(data);
  };

  const reconnect_to_project = reuseInFlight(async function() {
    let is_reconnect: boolean = false;
    if (conn !== undefined) {
      is_reconnect = true;
      conn.removeAllListeners();
      conn.end(); // just to be sure
    }
    const ws = await project_websocket(project_id);
    conn = await ws.api.terminal(path);
    conn.on("close", reconnect_to_project); // remove close; not when we end.
    terminal.ignore_terminal_data = true;
    conn.on("data", handle_data_from_project);
    if (is_reconnect) {
      terminal.emit("reconnect");
    }
  });

  terminal.reconnect_to_project = reconnect_to_project;
  await reconnect_to_project();
}


async function touch_path(project_id:string, path: string) : Promise<void> {
  // touch the original path file on disk, so it exists and is
  // modified -- that's the ONLY purpose of this touch.
  // Also this is in a separate function so we can await it and catch exception.
  try {
    await touch(project_id, path);
  } catch(err) {
    console.warn(`error touching ${path} -- ${err}`)
  }

}