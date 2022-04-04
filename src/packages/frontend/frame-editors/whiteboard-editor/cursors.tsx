import { ReactNode, useState } from "react";
import { Avatar } from "@cocalc/frontend/account/avatar/avatar";
import { getName } from "./elements/chat";
import { MAX_ELEMENTS } from "./math";
import { server_time } from "@cocalc/util/misc";
import { useInterval } from "react-interval-hook";

const CURSOR_TIME_MS = 30000;
const HIDE_NAME_TIMEOUT_MS = 10000;
const INTERVAL_MS = 2000;

interface Props {
  cursors?: { [account_id: string]: object[] };
  canvasScale: number;
}

const SIZE = 20;

export default function Cursors({ canvasScale, cursors }: Props) {
  const [counter, setCounter] = useState(0);
  useInterval(() => {
    // cause an update
    setCounter(counter + 1);
  }, INTERVAL_MS);

  if (cursors == null) {
    return <></>;
  }
  const now = server_time().valueOf();
  const v: ReactNode[] = [];
  for (const account_id in cursors) {
    const time = cursors[account_id]?.[0]?.["time"]?.valueOf() ?? 0;
    if (now - time >= CURSOR_TIME_MS) continue;
    v.push(
      <div key={account_id} style={{ display: "flex", height: `${SIZE}px` }}>
        <Avatar account_id={account_id} size={SIZE} />
        {now - time <= HIDE_NAME_TIMEOUT_MS && (
          <div
            style={{
              paddingLeft: "5px",
              paddingTop: "2px",
              color: "#666",
              fontSize: "10px",
            }}
          >
            {getName(account_id)}
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      style={{
        zIndex: MAX_ELEMENTS,
        width: "200px",
        position: "absolute",
        top: `${-5 - SIZE * v.length}px`,
        height: `${SIZE * v.length}px`,
        background: "white",
        opacity: 0.6,
        transform: `scale(${1 / canvasScale})`,
        transformOrigin: "top left",
      }}
    >
      {v}
    </div>
  );
}
