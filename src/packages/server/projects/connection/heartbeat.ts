import { heartbeat } from "@cocalc/util/message";
import { PROJECT_HUB_HEARTBEAT_INTERVAL_S } from "@cocalc/util/heartbeat";

export default function initHeartbeat(socket) {
  let alive: boolean = true;
  const stop = () => (alive = false);
  socket.on("end", stop);
  socket.on("close", stop);
  socket.on("error", stop);
  const sendHeartbeat = () => {
    if (!alive) return;
    socket.write_mesg("json", heartbeat());
    setTimeout(sendHeartbeat, PROJECT_HUB_HEARTBEAT_INTERVAL_S * 1000);
  };
  // start the heart beating!
  sendHeartbeat();
}
