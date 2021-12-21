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
      <Menu.Item key={"buy"}>
        <Icon name={"credit-card"} style={{ marginRight: "5px" }} /> Buy a
        License
      </Menu.Item>
      <Menu.Item key={"manage"}>
        <Icon name={"key"} style={{ marginRight: "5px" }} /> Your Licenses
      </Menu.Item>
      <Menu.Item key={"analytics"}>
        <Icon name={"key"} style={{ marginRight: "5px" }} /> Analytics
      </Menu.Item>
      <Menu.Item key={"projects"}>
        <Icon name={"edit"} style={{ marginRight: "5px" }} /> Licensed Projects
      </Menu.Item>
      <Menu.Item key={"cards"}>
        <Icon name={"credit-card"} style={{ marginRight: "5px" }} /> Payment
        Methods
      </Menu.Item>
      <Menu.Item key={"subscriptions"}>
        <Icon name={"calendar"} style={{ marginRight: "5px" }} /> Subscriptions
      </Menu.Item>
      <Menu.Item key={"receipts"}>
        <Icon name={"list"} style={{ marginRight: "5px" }} /> Invoices and
        Receipts
      </Menu.Item>
    </Menu>
  );
}
