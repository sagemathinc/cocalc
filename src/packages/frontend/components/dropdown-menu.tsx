/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { DownOutlined } from "@ant-design/icons";
import { Button, Dropdown, Menu } from "antd";
import type { DropdownProps, MenuProps } from "antd";
import { IS_TOUCH } from "../feature";
import { useState } from "react";

export const STAY_OPEN_ON_CLICK = "stay-open-on-click";

// overlay={menu} is deprecated. Instead, use MenuItems as items={...}.
export type MenuItems = NonNullable<MenuProps["items"]>;
export type MenuItem = MenuItems[number];

/**
 * NOTE: to work with this, make sure your list is typed as MenuItems. Then:
 *
 *  const v: MenuItems = [
 *    { key: "a", label: "A", onClick: () => { action(key); } },
 *    ...
 *    { type: "divider" },  // for a divider
 *    ...
 * ]
 */

interface Props {
  items: MenuItems;
  // show menu as a *Button* (disabled on touch devices -- https://github.com/sagemathinc/cocalc/issues/5113)
  button?: boolean;
  disabled?: boolean;
  showDown?: boolean;
  id?: string;
  maxHeight?: string;
  style?;
  title?: JSX.Element | string;
  size?;
  mode?: "vertical" | "inline";
  defaultOpen?: boolean;
}

const STYLE = { margin: "6px 10px", cursor: "pointer" } as const;

export function DropdownMenu({
  button,
  disabled,
  showDown,
  id,
  items,
  maxHeight,
  style,
  title,
  size,
  mode,
  defaultOpen,
}: Props) {
  const [open, setOpen] = useState<boolean>(!!defaultOpen);

  let body;

  if (button && !IS_TOUCH) {
    body = (
      <Button style={style} disabled={disabled} id={id} size={size}>
        {title ? (
          <>
            {title} {showDown && <DownOutlined />}
          </>
        ) : (
          // empty title implies to only show the downward caret sign
          <DownOutlined />
        )}
      </Button>
    );
  } else {
    if (disabled) {
      body = (
        <span
          id={id}
          style={{
            ...{
              color: "#777",
              cursor: "not-allowed",
            },
            ...STYLE,
          }}
        >
          <span style={style}>{title}</span>
        </span>
      );
    } else {
      body = (
        <span style={{ ...STYLE, ...style }} id={id}>
          {title}
        </span>
      );
    }
  }

  if (disabled) {
    return body;
  }

  const handleMenuClick: MenuProps["onClick"] = (e) => {
    if (e.key?.includes(STAY_OPEN_ON_CLICK)) {
      setOpen(true);
    } else {
      setOpen(false);
    }
  };

  const handleOpenChange: DropdownProps["onOpenChange"] = (nextOpen, info) => {
    if (info.source === "trigger" || nextOpen) {
      setOpen(nextOpen);
    }
  };

  return (
    <Dropdown
      destroyPopupOnHide
      trigger={["click"]}
      placement={"bottomLeft"}
      menu={{
        items,
        style: {
          maxHeight: maxHeight ?? "70vh",
          overflow: "auto",
        },
        mode,
        onClick: handleMenuClick,
      }}
      disabled={disabled}
      onOpenChange={handleOpenChange}
      open={open}
    >
      {body}
    </Dropdown>
  );
}

export function MenuItem(props) {
  const M: any = Menu.Item;
  return <M {...props}>{props.children}</M>;
}

export const MenuDivider = { type: "divider" } as const;
