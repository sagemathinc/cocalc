/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
X11 Window frame.
*/

import { Icon } from "@cocalc/frontend/components";
import { Map } from "immutable";
import { React, Rendered } from "../../app-framework";
import { Actions } from "./actions";
import { TAB_BAR_GREY, TAB_BAR_BLUE } from "./theme";
import { delay } from "awaiting";

interface Props {
  id: string;
  info: Map<string, any>;
  actions: Actions;
  is_current: boolean;
}

function isSame(prev, next) {
  return (
    prev.info.equals(next.info) &&
    prev.is_current === next.is_current &&
    prev.id === next.id
  );
}

export const WindowTab: React.FC<Props> = React.memo((props: Props) => {
  const { id, info, actions, is_current } = props;

  function render_icon(): Rendered {
    if (info.get("icon")) {
      return (
        <img
          height={"20px"}
          style={{ paddingRight: "5px" }}
          src={info.get("icon")}
        />
      );
    }
    return <Icon name="file" style={{ height: "20px", paddingRight: "5px" }} />;
  }

  function render_close_button(): Rendered {
    const color = is_current ? TAB_BAR_GREY : TAB_BAR_BLUE;
    const backgroundColor = is_current ? TAB_BAR_BLUE : TAB_BAR_GREY;
    return (
      <div
        style={{
          float: "right",
          backgroundColor,
          color,
          position: "relative",
          padding: "0 5px",
        }}
        onClick={async (evt) => {
          const wid = info.get("wid");
          actions.close_window(id, wid);
          evt.stopPropagation();

          // focus this frame in the next event loop.
          await delay(0);
          try {
            actions.focus(id);
          } catch (e) {
            // ignore - already closed.
          }
        }}
      >
        <Icon name="times" />
      </div>
    );
  }

  return (
    <div
      onClick={(evt) => {
        // FIRST set the active frame to the one we just clicked on!
        actions.set_active_id(id);
        // SECOND make this particular tab focused.
        actions.set_focused_window_in_frame(id, info.get("wid"));
        actions.client?.focus();
        evt.stopPropagation();
      }}
      style={{
        display: "inline-block",
        width: "250px",
        overflow: "hidden",
        whiteSpace: "nowrap",
        cursor: "pointer",
        margin: "5px 0 5px 5px",
        borderRight: "1px solid #aaa",
        background: is_current ? TAB_BAR_BLUE : TAB_BAR_GREY,
        color: is_current ? TAB_BAR_GREY : TAB_BAR_BLUE,
      }}
    >
      {render_close_button()}
      {render_icon()}
      {info.get("title")}
    </div>
  );
}, isSame);
