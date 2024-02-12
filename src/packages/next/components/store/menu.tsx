/*
 *  This file is part of CoCalc: Copyright © 2022 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import React, { useContext } from 'react';
import { Menu, MenuProps, Typography, Flex } from "antd";
import { useRouter } from "next/router";

import { currency } from "@cocalc/util/misc";
import { Icon } from "@cocalc/frontend/components/icon";
import { StoreBalanceContext } from "../../lib/balance";

const { Text } = Typography;

type MenuItem = Required<MenuProps>["items"][number];

const styles: { [k: string]: React.CSSProperties } = {
  menuBookend: {
    height: "100%",
    whiteSpace: "nowrap",
    flexGrow: 1,
    textAlign: "end"
  },
  menu: {
    width: "100%",
    height: "100%",
    border: 0,
  },
  menuRoot: {
    marginBottom: "24px",
    alignItems: "center",
    border: 0,
    borderBottom: "1px solid rgba(5, 5, 5, 0.06)",
    boxShadow: "none",
  },
  menuContainer: {
    alignItems: "center",
    whiteSpace: "nowrap",
    maxWidth: "100%",
    flexGrow: 1,
  },
};

export interface ConfigMenuProps {
  main?: string;
}

export default function ConfigMenu({ main }: ConfigMenuProps) {
  const router = useRouter();
  const { balance } = useContext(StoreBalanceContext);

  const handleMenuItemSelect: MenuProps["onSelect"] = ({ keyPath }) => {
    router.push(`/store/${keyPath[0]}`, undefined, {
      scroll: false,
    });
  }

  const items: MenuItem[] = [
    {
      label: "Licenses",
      key: "site-license",
      icon: <Icon name="key" />,
    },
    {
      label: "Cart",
      key: "cart",
      icon: <Icon name="shopping-cart" />,
    },
    {
      label: "Checkout",
      key: "checkout",
      icon: <Icon name="list" />,
    },
    {
      label: "Congrats",
      key: "congrats",
      icon: <Icon name="check-circle" />,
    },
    {
      label: "Vouchers",
      key: "vouchers",
      icon: <Icon name="gift" />,
    },
  ];

  return (
    <Flex gap="middle" justify="space-between" style={styles.menuRoot} wrap="wrap">
      <Flex style={styles.menuContainer} align="center">
        <Text strong>Store</Text>
        <Menu
          mode="horizontal"
          selectedKeys={main ? [main] : undefined}
          style={styles.menu}
          onSelect={handleMenuItemSelect}
          items={items}
        />
      </Flex>
      <Text strong style={styles.menuBookend}>
        {balance !== undefined ? `Balance: ${currency(balance)}` : null}
      </Text>
    </Flex>
  );
}
