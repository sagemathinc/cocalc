/*
Connect the term.js terminal object to the backend terminal session with the given path.
*/

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

  let ignore_terminal_data = false;

  /* To test this full_rerender, do this in a terminal then start resizing it:
         printf "\E[c\n" ; sleep 1 ; echo
  */
  async function full_rerender(): Promise<void> {
    try {
      ignore_terminal_data = true;
      terminal.reset();
      terminal.write(history);
      const core = (terminal as any)._core;
      while (core.writeBuffer.length > 0) {
        await delay(1);
      }
      terminal.scrollToBottom();
      await delay(0);  // next render loop
      terminal.scrollToBottom();
    } finally {
      await delay(50);  // just to be sure.
      ignore_terminal_data = false;
    }
  }

  terminal.on("resize", full_rerender);

  terminal.pause = function(): void {
    terminal.is_paused = true;
  };

  terminal.unpause = function(): void {
    terminal.is_paused = false;
    render(render_buffer);
    render_buffer = "";
  };

  terminal.conn.on("data", function(data) {
    if (typeof data === "string")
      if (terminal.is_paused) {
        render_buffer += data;
      } else {
        render(data);
      }
    else if (typeof data === "object") {
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
