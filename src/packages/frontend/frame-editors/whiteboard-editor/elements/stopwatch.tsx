import { Stopwatch as StopwatchEditor } from "@cocalc/frontend/editors/stopwatch/stopwatch";
import { getStyle } from "./text";
import { useFrameContext } from "../hooks";
import { webapp_client } from "@cocalc/frontend/webapp-client";

export default function Stopwatch({ element, focused }) {
  const { actions } = useFrameContext();
  const { data } = element;
  function set(obj) {
    actions.setElement({
      id: element.id,
      data: { ...data, ...obj, time: webapp_client.server_time() - 0 },
    });
  }

  return (
    <StopwatchEditor
      noLabel
      noDelete
      compact
      noButtons={!focused}
      state={data?.state ?? "stopped"}
      time={data?.time ?? 0}
      total={data?.total ?? 0}
      clickButton={(button: string) => {
        if (button == "start") {
          set({ state: "running" });
        } else if (button == "reset") {
          set({ state: "stopped", total: 0 });
        } else if (button == "pause") {
          set({
            total:
              (data?.total ?? 0) +
              (webapp_client.server_time() - (data?.time ?? 0)),
            state: "paused",
          });
        }
      }}
      timeStyle={getStyle(element, { fontSize: 20 })}
      style={{
        overflow: "scroll",
        border: "1px solid lightgrey",
        borderRadius: "5px",
        boxShadow: "0 0 5px grey",
      }}
    />
  );
}
