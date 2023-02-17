/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { Button } from "antd";
import React from "react";

import { CSS } from "@cocalc/frontend/app-framework";
import { Icon, IconName } from "@cocalc/frontend/components";
import { COLORS } from "@cocalc/util/theme";

const STYLE: CSS = {
  marginRight: "5px",
  marginBottom: "5px",
  width: "100%",
  height: "auto",
  whiteSpace: "normal",
};

const ICON_STYLE: CSS = {
  fontSize: "200%",
  color: COLORS.FILE_ICON,
};

interface Props {
  name: string;
  icon: IconName;
  on_click: (ext?: string) => void;
  ext?: string;
  className?: string;
  disabled?: boolean;
  loading?: boolean;
  active?: boolean;
}

export const NewFileButton = React.memo((props: Props) => {
  const {
    name,
    icon,
    on_click,
    ext,
    className,
    disabled,
    loading,
    active = false,
  } = props;

  const displayed_icon = loading ? (
    <Icon style={ICON_STYLE} name="cocalc-ring" spin />
  ) : (
    <Icon style={ICON_STYLE} name={icon} />
  );

  const style: CSS = {
    ...STYLE,
    ...(active
      ? {
          borderColor: COLORS.ANTD_LINK_BLUE,
          backgroundColor: COLORS.ANTD_BG_BLUE_L,
        }
      : {}),
  };

  return (
    <Button
      size="large"
      onClick={(): void => {
        on_click?.(ext);
      }}
      style={style}
      className={className}
      disabled={disabled || loading}
    >
      <div>
        {displayed_icon}
        <br />
        <span style={{ color: COLORS.GRAY_D }}>{name}</span>
      </div>
    </Button>
  );
});
