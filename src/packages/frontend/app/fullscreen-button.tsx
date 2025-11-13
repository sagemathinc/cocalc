/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { useIntl } from "react-intl";

import {
  CSS,
  React,
  useActions,
  useTypedRedux,
} from "@cocalc/frontend/app-framework";
import { Icon, Tip } from "@cocalc/frontend/components";
import track from "@cocalc/frontend/user-tracking";
import { COLORS } from "@cocalc/util/theme";
import {
  NAV_HEIGHT_PX,
  PageStyle,
  TOP_BAR_ELEMENT_CLASS,
} from "./top-nav-consts";

const TIP_STYLE_FULLSCREEN: CSS = {
  position: "fixed",
  zIndex: 100,
  right: 0,
  top: 0,
} as const;

interface Props {
  pageStyle: PageStyle;
}

export const FullscreenButton: React.FC<Props> = React.memo((props: Props) => {
  const { pageStyle } = props;
  const { fontSizeIcons } = pageStyle;

  const intl = useIntl();
  const fullscreen = useTypedRedux("page", "fullscreen");
  const page_actions = useActions("page");

  if (fullscreen == "kiosk" || fullscreen == "project") {
    // no button, since can't get out.
    return <></>;
  }

  const icon = fullscreen ? "compress" : "expand";
  const icon_style: CSS = {
    fontSize: fontSizeIcons,
    color: COLORS.GRAY,
    cursor: "pointer",
    ...(fullscreen
      ? {
          background: "white",
          opacity: 0.7,
          border: "1px solid grey",
        }
      : {
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          height: `${NAV_HEIGHT_PX}px`,
          width: `${NAV_HEIGHT_PX}px`,
        }),
  };

  const tooltip = intl.formatMessage({
    id: "app.fullscreen-button.tooltip",
    defaultMessage: "Fullscreen mode, focused on the current document or page.",
  });

  return (
    <Tip
      style={fullscreen === "default" ? TIP_STYLE_FULLSCREEN : undefined}
      title={tooltip}
      placement={"bottomRight"}
      delayShow={2000}
    >
      <Icon
        className={TOP_BAR_ELEMENT_CLASS}
        style={icon_style}
        name={icon}
        onClick={(_) => {
          track("top_nav", {
            name: "fullscreen",
            enabled: !fullscreen,
          });
          page_actions.toggle_fullscreen();
        }}
      />
    </Tip>
  );
});
