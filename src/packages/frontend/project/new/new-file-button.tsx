/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Button } from "antd";

import { Icon, IconName } from "@cocalc/frontend/components/icon";
import { unreachable } from "@cocalc/util/misc";
import { COLORS } from "@cocalc/util/theme";
import { NEW_FILETYPE_ICONS, isNewFiletypeIconName } from "./consts";

export const STYLE = {
  marginRight: "5px",
  marginBottom: "5px",
  whiteSpace: "normal",
  padding: "10px",
  height: "auto",
} as const;

const ICON_STYLE = {
  color: COLORS.FILE_ICON,
  fontSize: "125%",
} as const;

const ICON_STYLE_LARGE = {
  ...ICON_STYLE,
  fontSize: "200%",
};

interface Props {
  name: string | React.JSX.Element;
  href?: string;
  on_click?: (ext?: string) => void;
  ext?: string;
  className?: string;
  disabled?: boolean;
  loading?: boolean;
  active?: boolean;
  size?: "large" | "small";
  mode?: "primary" | "secondary";
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
  mode = "primary",
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
    ...(mode === "secondary" ? { padding: "5px" } : { width: "100%" }),
    ...(active && mode === "secondary" ? {} : undefined),
    ...(size == "large" ? { minHeight: "125px" } : undefined),
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
      {...(typeof name === "string" ? { "aria-label": name } : {})}
    >
      {renderBody()}
    </Button>
  );
}
