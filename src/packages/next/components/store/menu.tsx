/*
 *  This file is part of CoCalc: Copyright © 2022 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { Icon } from "@cocalc/frontend/components/icon";
import { Menu, MenuProps, Typography } from "antd";
import { useRouter } from "next/router";
const { Text } = Typography;
import useProfile from "lib/hooks/profile";

type MenuItem = Required<MenuProps>["items"][number];

export default function ConfigMenu({ main }) {
  const router = useRouter();
  const profile = useProfile();

  function select(e) {
    router.push(`/store/${e.keyPath[0]}`, undefined, {
      scroll: false,
    });
  }

  const items: MenuItem[] = [
    { label: <Text strong>Store</Text>, key: "" },
    {
      label: "Upgrade",
      key: "site-license",
      icon: <Icon name="key" />,
    },
    {
      label: "Booster",
      key: "boost",
      icon: <Icon name="rocket" />,
    },
    {
      label: "Dedicated VM or Disk",
      key: "dedicated",
      icon: <Icon name="dedicated" />,
    },
    { label: "Cart", key: "cart", icon: <Icon name="shopping-cart" /> },
    { label: "Checkout", key: "checkout", icon: <Icon name="list" /> },
  ];

  if (profile?.is_partner) {
    items.push({
      label: "Create Vouchers",
      key: "create-vouchers",
      icon: <Icon name="credit-card" />,
    });
  }
  items.push({
    label: "Congrats",
    key: "congrats",
    icon: <Icon name="check-circle" />,
  });

  return (
    <Menu
      mode="horizontal"
      selectedKeys={[main]}
      style={{ height: "100%", marginBottom: "24px" }}
      onSelect={select}
      items={items}
    />
  );
}
