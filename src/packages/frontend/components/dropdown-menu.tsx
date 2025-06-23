/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*

NOTES:

MOBILE: Antd's Dropdown fully supports *nested* menus, with children.
This is great on a desktop, but is frequently completely unusable
on mobile, where the submenu appears off the screen, and is
hence completely unusable.  Thus on mobile we basically flatten
then menu so it is still usable.

*/
import { IS_MOBILE } from "@cocalc/frontend/feature";
import { DownOutlined } from "@ant-design/icons";
import { Button, Dropdown, Menu } from "antd";
import type { DropdownProps, MenuProps } from "antd";
import { useMemo, useState } from "react";

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

export function DropdownMenu({
  button,
  disabled,
  showDown,
  id,
  items: items0,
  maxHeight,
  style,
  title,
  size,
  mode,
  defaultOpen,
}: Props) {
  const [open, setOpen] = useState<boolean>(!!defaultOpen);
  const items = useMemo(() => {
    return IS_MOBILE ? flatten(items0) : items0;
  }, [items0]);

  let body = (
    <Button
      style={style}
      disabled={disabled}
      id={id}
      size={size}
      type={button ? undefined : "text"}
    >
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
      destroyOnHidden
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

function flatten(items) {
  const v: typeof items = [];
  for (const item of items) {
    if (item.children) {
      const x = { ...item, disabled: true };
      delete x.children;
      v.push(x);
      for (const i of flatten(item.children)) {
        v.push({
          ...i,
          label: <div style={{ marginLeft: "25px" }}>{i.label}</div>,
        });
      }
    } else {
      v.push(item);
    }
  }
  return v;
}
