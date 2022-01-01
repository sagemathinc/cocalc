import { Menu } from "antd";
import { Icon } from "@cocalc/frontend/components/icon";
import { useRouter } from "next/router";

export default function ConfigMenu({ main }) {
  const router = useRouter();

  return (
    <Menu
      mode="horizontal"
      selectedKeys={[main]}
      style={{ height: "100%" }}
      onSelect={(e) => {
        router.push(`/billing/${e.keyPath[0]}`, undefined, {
          scroll: false,
        });
      }}
    >
      <Menu.Item key={""}>
        <b style={{ color: "#666" }}>Billing</b>
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
