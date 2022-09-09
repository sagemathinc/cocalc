/*
 *  This file is part of CoCalc: Copyright © 2021 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { Icon } from "@cocalc/frontend/components/icon";
import { Menu, MenuProps, Typography } from "antd";
import { useRouter } from "next/router";
const { Text } = Typography;

type MenuItem = Required<MenuProps>["items"][number];

export default function ConfigMenu({ main }) {
  const router = useRouter();

  function select(e) {
    router.push(`/billing/${e.keyPath[0]}`, undefined, {
      scroll: false,
    });
  }

  const items: MenuItem[] = [
    { label: <Text strong>Billing</Text>, key: "" },
    { label: "Cards", key: "cards", icon: <Icon name={"credit-card"} /> },
    {
      label: "Subscriptions",
      key: "subscriptions",
      icon: <Icon name={"calendar"} />,
    },
    {
      label: "Invoices and Receipts",
      key: "receipts",
      icon: <Icon name={"list"} />,
    },
  ];

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
