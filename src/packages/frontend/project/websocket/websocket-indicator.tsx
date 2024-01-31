/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
Websocket connection status indicator for a single project.
*/

import { Icon } from "@cocalc/frontend/components";
import { COLORS } from "@cocalc/util/theme";
import { WebsocketState } from "./websocket-state";

interface Props {
  state?: WebsocketState;
}

export function WebsocketIndicator({ state }: Props) {
  if (state === "online") {
    // show nothing when online for now, to reduce clutter.
    // NOTE: stay consisten with title-bar.tsx's connection indicator.
    return <span />;
  }

  return (
    <span title={state}>
      <Icon
        style={{
          color: color(state),
        }}
        name={"wifi"}
      />
    </span>
  );
}

function color(state: WebsocketState | undefined): string {
  switch (state) {
    case "destroyed":
      return COLORS.CONN.DISCONNECTED;
    case "online":
      return COLORS.CONN.ONLINE;
    case "offline": // trying to connect.
      return COLORS.CONN.OFFLINE;
    default:
      // don't know yet, so same as offline.
      return COLORS.CONN.OFFLINE;
  }
}
