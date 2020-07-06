/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { React, useRedux, useActions } from "../app-framework";
import { Icon, Tip } from "../r_misc";
import { COLORS } from "smc-util/theme";
import { user_tracking } from "../user-tracking";

const TIP_STYLE: React.CSSProperties = {
  position: "fixed",
  zIndex: 10000,
  right: 0,
  top: "-1px",
  borderRadius: "3px",
} as const;

const ICON_STYLE: React.CSSProperties = {
  fontSize: "13pt",
  padding: 2,
  color: COLORS.GRAY,
  cursor: "pointer",
} as const;

export const FullscreenButton: React.FC = React.memo(() => {
  const fullscreen: undefined | "default" | "kiosk" = useRedux(
    "page",
    "fullscreen"
  );
  const page_actions = useActions("page");

  const icon = fullscreen ? "compress" : "expand";
  const icon_style = {
    ...ICON_STYLE,
    ...(fullscreen
      ? { background: "#fff", opacity: 0.7, border: "1px solid grey" }
      : undefined),
  };

  return (
    <Tip
      style={TIP_STYLE}
      title={"Fullscreen mode, focused on the current document or page."}
      placement={"left"}
      delayShow={2000}
    >
      <Icon
        style={icon_style}
        name={icon}
        onClick={(_) => {
          user_tracking("top_nav", {
            name: "fullscreen",
            enabled: !fullscreen,
          });
          page_actions.toggle_fullscreen();
        }}
      />
    </Tip>
  );
});
