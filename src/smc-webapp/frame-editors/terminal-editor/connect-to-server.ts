/*
Connect the term.js terminal object to the backend terminal session with the given path.
*/

const { webapp_client } = require("smc-webapp/webapp_client");

export async function connect_to_server(
  project_id: string,
  path: string,
  terminal: any
): Promise<void> {
  const ws = await webapp_client.project_websocket(project_id);

  terminal.conn = await ws.api.terminal(path);

  terminal.is_paused = false;

  let render_buffer: string = "";
  function render(data: string): void {
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
    terminal.conn.write(data);
  });
}
