/*
TODO

Should be possible to edit the label for the timer.

In general, maybe all elements could have labels and the main thing here is to
ensure it also gets used for the modal when the timer goes off.
*/

import { useRef } from "react";
import StopwatchEditor from "@cocalc/frontend/editors/stopwatch/stopwatch";
import { getStyle } from "./text";
import { useFrameContext } from "../hooks";
import { webapp_client } from "@cocalc/frontend/webapp-client";
import type { Element } from "../types";

interface Props {
  element: Element;
  focused?: boolean;
  readOnly?: boolean;
}

function getTime(): number {
  return webapp_client.server_time() - 0;
}

export default function Stopwatch({ element, focused, readOnly }: Props) {
  const { actions } = useFrameContext();
  const eltRef = useRef<Element>(element);
  eltRef.current = element;
  const { data } = element;
  function set(obj) {
    actions.setElementData({ element: eltRef.current, obj, cursors: [{}] });
  }

  const timeStyle = getStyle(element, { fontSize: 20 });

  return (
    <>
      <StopwatchEditor
        readOnly={readOnly}
        noLabel
        noDelete
        compact
        noButtons={!focused}
        state={data?.state ?? "stopped"}
        time={data?.time ?? 0}
        total={data?.total ?? 0}
        label={"Whiteboard timer has finished."}
        countdown={
          data?.countdown /* do not default to 0 since this determines if is a timer or stopwatch */
        }
        clickButton={(button: string) => {
          const time = getTime();
          if (button == "start") {
            set({ state: "running", time });
          } else if (button == "reset") {
            set({ state: "stopped", total: 0, time });
          } else if (button == "pause") {
            set({
              time,
              total:
                (data?.total ?? 0) +
                (webapp_client.server_time() - (data?.time ?? 0)),
              state: "paused",
            });
          }
        }}
        timeStyle={timeStyle}
        style={{
          overflow: "scroll",
          border: "1px solid lightgrey",
          borderRadius: "5px",
          boxShadow: "0 0 5px grey",
        }}
        setCountdown={(countdown) => {
          set({ countdown });
        }}
      />
    </>
  );
}
