/*
 *  This file is part of CoCalc: Copyright © 2022 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Menu } from "antd";
import { useEffect, useMemo, useState } from "react";

import { Icon } from "@cocalc/frontend/components/icon";
import { capitalize } from "@cocalc/util/misc";
import { menuItem, MenuItems } from "components/antd-menu-items";
import { useRouter } from "next/router";
import { menu, topIcons } from "./register";

export default function ConfigMenu({ main, sub }) {
  const router = useRouter();
  const [openKeys, setOpenKeys] = useState<string[]>([main]);

  // This useEffect is to ensure that the selected section (main)
  // is always expanded, e.g., when you get there by clicking on
  // a search result:
  useEffect(() => {
    if (openKeys.indexOf(main) == -1) {
      setOpenKeys(openKeys.concat([main]));
    }
  }, [main]);

  const items: MenuItems = useMemo(
    () =>
      Object.keys(menu).map((main) => {
        const sub = Object.keys(menu[main]).map((sub) => {
          const { title, icon, danger } = menu[main][sub];
          return menuItem(`${main}/${sub}`, title, icon, undefined, danger);
        });

        const title = capitalize(main);
        const icon = topIcons[main] ?? "gear";
        return menuItem(main, title, <Icon name={icon} />, sub);
      }),
    []
  );

  return (
    <Menu
      mode="inline"
      openKeys={openKeys}
      onOpenChange={(keys) => {
        setOpenKeys(keys);
      }}
      selectedKeys={[main + "/" + sub]}
      style={{ height: "100%" }}
      onSelect={(e) => {
        router.push(`/config/${e.keyPath[0]}`, undefined, {
          scroll: false,
        });
      }}
      items={items}
    />
  );
}
