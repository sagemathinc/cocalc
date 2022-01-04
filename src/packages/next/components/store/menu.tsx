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
        router.push(`/store/${e.keyPath[0]}`, undefined, {
          scroll: false,
        });
      }}
    >
      <Menu.Item key={""}>
        <b style={{ color: "#666" }}>Store</b>
      </Menu.Item>
      <Menu.Item key={"site-license"}>
        <Icon name={"key"} style={{ marginRight: "5px" }} /> Site Licenses
      </Menu.Item>
      <Menu.Item key={"cart"}>
        <Icon name={"shopping-cart"} style={{ marginRight: "5px" }} /> Cart
      </Menu.Item>
      <Menu.Item key={"checkout"}>
        <Icon name={"list"} style={{ marginRight: "5px" }} /> Checkout
      </Menu.Item>
    </Menu>
  );
}
