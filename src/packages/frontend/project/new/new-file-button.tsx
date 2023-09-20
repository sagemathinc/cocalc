/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { Button } from "antd";
import { Icon, IconName } from "@cocalc/frontend/components/icon";
import { COLORS } from "@cocalc/util/theme";
import { unreachable } from "@cocalc/util/misc";
import { NEW_FILETYPE_ICONS, isNewFiletypeIconName } from "./consts";

const STYLE = {
  marginRight: "5px",
  marginBottom: "5px",
  width: "100%",
  height: "auto",
  whiteSpace: "normal",
  padding: "10px",
} as const;

const ICON_STYLE = {
  color: COLORS.FILE_ICON,
} as const;

const ICON_STYLE_LARGE = {
  ...ICON_STYLE,
  fontSize: "200%",
};

interface Props {
  name: string;
  href?: string;
  on_click?: (ext?: string) => void;
  ext?: string;
  className?: string;
  disabled?: boolean;
  loading?: boolean;
  active?: boolean;
  size?: "large" | "small";
  icon?: IconName;
}

export function NewFileButton({
  name,
  href,
  on_click,
  ext,
  icon: propsIcon,
  className,
  disabled,
  loading,
  active = false,
  size = "large",
}: Props) {
  const iconStyle = size === "large" ? ICON_STYLE_LARGE : ICON_STYLE;
  const icon: IconName =
    propsIcon ??
    (isNewFiletypeIconName(ext) ? NEW_FILETYPE_ICONS[ext!] : "file");

  const displayed_icon = loading ? (
    <Icon style={iconStyle} name="cocalc-ring" spin />
  ) : (
    <Icon style={iconStyle} name={icon} />
  );

  const style = {
    ...STYLE,
    ...(active
      ? {
          borderColor: COLORS.ANTD_LINK_BLUE,
          backgroundColor: COLORS.ANTD_BG_BLUE_L,
        }
      : {}),
  };

  function renderBody() {
    switch (size) {
      case "large":
        return (
          <div>
            {displayed_icon}
            <br />
            <span style={{ color: COLORS.GRAY_D }}>{name}</span>
          </div>
        );
      case "small":
        return (
          <div>
            {displayed_icon}{" "}
            <span style={{ color: COLORS.GRAY_D }}>{name}</span>
          </div>
        );
      default:
        unreachable(size);
    }
  }

  return (
    <Button
      size={size}
      onClick={(): void => {
        on_click?.(ext);
      }}
      href={href}
      style={style}
      className={className}
      disabled={disabled || loading}
    >
      {renderBody()}
    </Button>
  );
}
