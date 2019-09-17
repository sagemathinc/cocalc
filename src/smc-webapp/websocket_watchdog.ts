// this is motivated by chrome 77 issues, where the websocket can't re-establish a connection
// this checks for specific error messages and alerts the user about closing and opening the browser

import { alert_message } from "./alerts";

export function watch() {
  window.addEventListener("error", function(event) {
    const is_websocket = event.message.startsWith("WebSocket connection to");
    const is_fail = event.message.includes("failed");
    //const chrome_77 = event.message.includes('Unknown reason');

    if (is_websocket && is_fail) {
      alert_message({
        type: "error",
        message:
          "Connection issues! You have to close and re-open your Chrome browser!"
      });
    }
  });
}
