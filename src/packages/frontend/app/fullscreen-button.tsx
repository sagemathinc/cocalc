/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import {
  CSS,
  React,
  useActions,
  useRedux,
} from "@cocalc/frontend/app-framework";
import { Icon, Tip } from "@cocalc/frontend/components";
import { COLORS } from "@cocalc/util/theme";
import { user_tracking } from "../user-tracking";
import { FONT_SIZE_ICONS, TOP_PADDING_ICONS } from "./top-nav-consts";

const TIP_STYLE: CSS = {
  position: "fixed",
  zIndex: 100,
  right: 0,
  top: 0,
} as const;

const ICON_STYLE: CSS = {
  fontSize: FONT_SIZE_ICONS,
  padding: `${TOP_PADDING_ICONS}`,
  color: COLORS.GRAY,
  cursor: "pointer",
} as const;

const ICON_STYLE_FULLSCREEN: CSS = {
  ...ICON_STYLE,
  fontSize: "14px",
  background: "white",
  opacity: 0.7,
  border: "1px solid grey",
};

export const FullscreenButton: React.FC = React.memo(() => {
  const fullscreen: undefined | "default" | "kiosk" | "project" = useRedux(
    "page",
    "fullscreen"
  );
  const page_actions = useActions("page");

  if (fullscreen == "kiosk" || fullscreen == "project") {
    // no button, since can't get out.
    return <></>;
  }

  const icon = fullscreen ? "compress" : "expand";
  const icon_style = fullscreen ? ICON_STYLE_FULLSCREEN : ICON_STYLE;

  return (
    <Tip
      style={TIP_STYLE}
      title={"Fullscreen mode, focused on the current document or page."}
      placement={"bottomLeft"}
      delayShow={2000}
    >
      <Icon
        className="smc-top-bar-topright-element"
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
