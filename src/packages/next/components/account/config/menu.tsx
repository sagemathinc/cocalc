import { Menu } from "antd";
import { Icon } from "@cocalc/frontend/components/icon";
import { useRouter } from "next/router";
import { ReactNode, useEffect, useState } from "react";
import { menu, topIcons } from "./register";
import { capitalize } from "@cocalc/util/misc";

const { SubMenu } = Menu;

function menuBody() {
  const v: ReactNode[] = [];
  for (const main in menu) {
    const title = capitalize(main);
    const icon = topIcons[main] ?? "gear";
    const w: ReactNode[] = [];
    for (const sub in menu[main]) {
      const { title, icon, danger } = menu[main][sub];
      w.push(
        <Menu.Item key={sub} danger={danger}>
          <Icon name={icon} style={{ marginRight: "5px" }} /> {title}
        </Menu.Item>
      );
    }
    v.push(
      <SubMenu key={main} icon={<Icon name={icon} />} title={title}>
        {w}
      </SubMenu>
    );
  }
  return v;
}

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

  return (
    <Menu
      mode="inline"
      openKeys={openKeys}
      onOpenChange={(keys) => {
        setOpenKeys(keys);
      }}
      selectedKeys={[sub]}
      style={{ height: "100%" }}
      onSelect={(e) => {
        const [sub, main] = e.keyPath;
        router.push(`/config/${main}/${sub}`, undefined, {
          scroll: false,
        });
      }}
    >
      {menuBody()}
    </Menu>
  );
}
