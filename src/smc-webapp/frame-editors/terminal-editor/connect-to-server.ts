/*
Connect the term.js terminal object to the backend terminal session with the given path.
*/

import { debounce } from "underscore";

const { webapp_client } = require("smc-webapp/webapp_client");

import { delay } from "awaiting";

import { aux_file } from "../frame-tree/util";

const MAX_HISTORY_LENGTH = 100 * 5000;

export async function connect_to_server(
  project_id: string,
  path: string,
  terminal: any,
  number: number
): Promise<void> {
  const ws = await webapp_client.project_websocket(project_id);

  path = aux_file(`${path}-${number}`, "term");
  terminal.conn = await ws.api.terminal(path);
  terminal.path = path;

  terminal.conn.on("end", function() {
    console.log("conn end");
  });

  terminal.is_paused = false;
  terminal.conn.write({ cmd: "size", rows: 15, cols: 80 });

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

  let ignore_terminal_data = true;

  /* To test this full_rerender, do this in a terminal then start resizing it:
         printf "\E[c\n" ; sleep 1 ; echo
  */
  const full_rerender = debounce(async () => {
    ignore_terminal_data = true;
    terminal.reset();
    // This is a horrible hack, since we have to be sure the
    // reset (and its side effects) are really done before writing
    // the history again -- otherwise, the scroll is messed up.
    // The call to requestAnimationFrame is also done in xterm.js.
    // This really sucks.  It would probably be far better to just
    // REPLACE the terminal by a new one on resize!
    await delay(0);
    requestAnimationFrame(async () => {
      await delay(1);
      terminal.write(history);
      // NEED to make sure no device attribute requests are going out (= corruption!)
      // TODO: surely there is a better way.
      await delay(50);
      terminal.scrollToBottom(); // just in case.
      ignore_terminal_data = false;
    });
  }, 250);

  let last_size_rows, last_size_cols;
  terminal.on("resize", function() {
    if (terminal.cols === last_size_cols && terminal.rows === last_size_rows) {
      // no need to re-render
      return;
    }
    last_size_rows = terminal.rows;
    last_size_cols = terminal.cols;
    full_rerender();
  });

  terminal.pause = function(): void {
    terminal.is_paused = true;
  };

  terminal.unpause = function(): void {
    terminal.is_paused = false;
    render(render_buffer);
    render_buffer = "";
  };

  let first_conn_data: boolean = true;
  terminal.conn.on("data", async function(data) {
    if (typeof data === "string") {
      if (terminal.is_paused && !first_conn_data) {
        render_buffer += data;
      } else {
        render(data);
      }
      if (first_conn_data) {
        await delay(50);
        ignore_terminal_data = false;
        first_conn_data = false;
      }
    } else if (typeof data === "object") {
      terminal.emit("mesg", data);
    }
  });

  terminal.on("data", function(data) {
    if (ignore_terminal_data) {
      return;
    }
    terminal.conn.write(data);
  });
}
