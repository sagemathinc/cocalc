import { Menu } from "antd";
import { Icon } from "@cocalc/frontend/components/icon";
import { useRouter } from "next/router";

export default function ConfigMenu({ main }) {
  const router = useRouter();

  return (
    <Menu
      mode="inline"
      selectedKeys={[main]}
      style={{ height: "100%" }}
      onSelect={(e) => {
        router.push(`/licenses/${e.keyPath[0]}`, undefined, {
          scroll: false,
        });
      }}
    >
      <Menu.Item key={""}>
        <b style={{ fontSize: "16pt", color: "#666" }}>Licenses</b>
      </Menu.Item>

      <Menu.Item key={"create"}>
        <Icon name={"credit-card"} style={{ marginRight: "5px" }} /> Create a
        License
      </Menu.Item>
      <Menu.Item key={"managed"}>
        <Icon name={"key"} style={{ marginRight: "5px" }} /> Licenses You Manage
      </Menu.Item>
      <Menu.Item key={"projects"}>
        <Icon name={"edit"} style={{ marginRight: "5px" }} /> Your Licensed
        Projects
      </Menu.Item>
      <Menu.Item key={"how-license-used"}>
        <Icon name={"key"} style={{ marginRight: "5px" }} /> How a License is
        Used
      </Menu.Item>
    </Menu>
  );
}
