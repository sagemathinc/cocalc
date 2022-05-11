import { Menu, MenuProps } from "antd";
import { Icon } from "@cocalc/frontend/components/icon";
import { useRouter } from "next/router";

type MenuItem = Required<MenuProps>["items"][number];

export default function ConfigMenu({ main }) {
  const router = useRouter();

  const items: MenuItem[] = [
    { label: <b style={{ color: "#666" }}>Licenses</b>, key: "" },
    { label: "Manage", key: "managed", icon: <Icon name={"key"} /> },
    { label: "Projects", key: "projects", icon: <Icon name={"edit"} /> },
    { label: "How Used", key: "how-used", icon: <Icon name={"key"} /> },
  ];

  return (
    <Menu
      mode="horizontal"
      selectedKeys={[main]}
      style={{ height: "100%" }}
      onSelect={(e) => {
        router.push(`/licenses/${e.keyPath[0]}`, undefined, {
          scroll: false,
        });
      }}
      items={items}
    />
  );
}
