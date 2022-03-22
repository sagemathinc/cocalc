import { Menu, Typography } from "antd";
import { Icon } from "@cocalc/frontend/components/icon";
import { useRouter } from "next/router";
const { Text } = Typography;

export default function ConfigMenu({ main }) {
  const router = useRouter();

  const style = { marginRight: "5px" };

  function select(e) {
    router.push(`/store/${e.keyPath[0]}`, undefined, {
      scroll: false,
    });
  }

  function renderNew() {
    if (new Date().getTime() > new Date("2022-09-01").getTime()) return;

    return (
      <Text italic>
        <sup>new</sup>
      </Text>
    );
  }

  return (
    <Menu
      mode="horizontal"
      selectedKeys={[main]}
      style={{ height: "100%" }}
      onSelect={select}
    >
      <Menu.Item key={""}>
        <Text strong>Store</Text>
      </Menu.Item>
      <Menu.Item key={"site-license"}>
        <Icon name={"key"} style={style} /> Site License
      </Menu.Item>
      <Menu.Item key={"boost"}>
        <Icon name={"rocket"} style={style} /> Boost{renderNew()}
      </Menu.Item>
      <Menu.Item key={"cart"}>
        <Icon name={"shopping-cart"} style={style} /> Cart
      </Menu.Item>
      <Menu.Item key={"checkout"}>
        <Icon name={"list"} style={style} /> Checkout
      </Menu.Item>
      <Menu.Item key={"congrats"}>
        <Icon name={"check-circle"} style={style} /> Congrats
      </Menu.Item>
    </Menu>
  );
}
