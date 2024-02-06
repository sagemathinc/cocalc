/*
 *  This file is part of CoCalc: Copyright © 2022 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import React, { useContext } from 'react';
import { Menu, MenuProps, Flex, Typography } from "antd";
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
  },
  menu: {
    width: "100%",
    height: "100%",
    border: 0
  },
  menuContainer: {
    marginBottom: "24px",
    whiteSpace: "nowrap",
    alignItems: "center",
    border: 0,
    borderBottom: "1px solid rgba(5, 5, 5, 0.06)",
    boxShadow: "none",
  }
};

export interface ConfigMenuProps {
  main?: string;
}

export default function ConfigMenu({ main }: ConfigMenuProps) {
  const router = useRouter();
  const { balance } = useContext(StoreBalanceContext);

  const handleMenuItemSelect: MenuProps['onSelect'] = ({ keyPath }) => {
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
    <Flex gap="middle" justify="space-between" style={styles.menuContainer}>
      <Text strong style={styles.menuBookend}>Store</Text>
      <Menu
        mode="horizontal"
        selectedKeys={main ? [main] : undefined}
        style={styles.menu}
        onSelect={handleMenuItemSelect}
        items={items}
      />
      <Text strong style={styles.menuBookend}>
        {balance !== undefined ? `Balance: ${currency(balance)}` : null}
      </Text>
    </Flex>
  );
}
