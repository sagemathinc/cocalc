/*
 *  This file is part of CoCalc: Copyright © 2022 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Icon } from "@cocalc/frontend/components/icon";
import { WORKSPACES_LABEL } from "@cocalc/util/i18n/terminology";
import { Menu, MenuProps, Typography } from "antd";
import { useRouter } from "next/router";
const { Text } = Typography;

type MenuItem = Required<MenuProps>["items"][number];

export default function ConfigMenu({ main }) {
  const router = useRouter();

  const items: MenuItem[] = [
    { label: <Text strong>Licenses</Text>, key: "" },
    { label: "Manage", key: "managed", icon: <Icon name={"key"} /> },
    {
      label: WORKSPACES_LABEL,
      key: "projects",
      icon: <Icon name={"edit"} />,
    },
    { label: "How Used", key: "how-used", icon: <Icon name={"graph"} /> },
  ];

  function select(e) {
    router.push(`/licenses/${e.keyPath[0]}`, undefined, {
      scroll: false,
    });
  }

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
