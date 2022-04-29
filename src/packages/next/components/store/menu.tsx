import { Icon } from "@cocalc/frontend/components/icon";
import { Menu, MenuProps, Typography } from "antd";
import { useRouter } from "next/router";
const { Text } = Typography;

type MenuItem = Required<MenuProps>["items"][number];

export default function ConfigMenu({ main }) {
  const router = useRouter();

  // const style = { marginRight: "5px" };

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

  const items: MenuItem[] = [
    { label: "Store", key: "store" },
    { label: "Site License", key: "site-license", icon: <Icon name="key" /> },
    {
      label: <>Boost {renderNew()}</>,
      key: "boost",
      icon: <Icon name="rocket" />,
    },
    {
      label: <>Dedicated {renderNew()}</>,
      key: "dedicated",
      icon: <Icon name="dedicated" />,
    },
    { label: "Cart", key: "cart", icon: <Icon name="shopping-cart" /> },
    { label: "Checkout", key: "checkout", icon: <Icon name="list" /> },
    { label: "Congrats", key: "congrats", icon: <Icon name="check-circle" /> },
  ];

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
