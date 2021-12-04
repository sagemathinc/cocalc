import { Menu } from "antd";
import { Icon } from "@cocalc/frontend/components/icon";
import { useRouter } from "next/router";
import { useEffect, useState } from "react";

const { SubMenu } = Menu;

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
      style={{ height: "100%", borderRight: 0 }}
      onSelect={(e) => {
        const [sub, main] = e.keyPath;
        router.push(`/config/${main}/${sub}`, undefined, {
          scroll: false,
        });
      }}
    >
      <SubMenu key="search" icon={<Icon name="search" />} title="Search">
        <Menu.Item key="input">
          <Icon name="list" /> Input...
        </Menu.Item>
      </SubMenu>
      <SubMenu key="account" icon={<Icon name="user" />} title="Account">
        <Menu.Item key="name">
          <Icon name="user-times" /> Name
        </Menu.Item>
        <Menu.Item key="email">
          <Icon name="paper-plane" /> Email Address
        </Menu.Item>
        <Menu.Item key="avatar">
          <Icon name="user" /> Avatar Image
        </Menu.Item>
        <Menu.Item key="link">
          <Icon name="external-link" /> Link Account
        </Menu.Item>
        <Menu.Item key="ssh">
          <Icon name="key" /> SSH Keys
        </Menu.Item>
        <Menu.Item key="api">
          <Icon name="key" /> API Key
        </Menu.Item>
        <Menu.Item key="delete" danger>
          <Icon name="trash" /> Delete Account
        </Menu.Item>
        <Menu.Item key="sign-out">
          <Icon name="sign-out-alt" /> Sign Out
        </Menu.Item>
      </SubMenu>
      <SubMenu key="editor" icon={<Icon name="edit" />} title="Editor">
        <Menu.Item key="appearance">Appearance</Menu.Item>
        <Menu.Item key="autosave">Autosave</Menu.Item>
        <Menu.Item key="keyboard">Keyboard</Menu.Item>
        <Menu.Item key="options">Options</Menu.Item>
      </SubMenu>
      <SubMenu key="system" icon={<Icon name="gear" />} title="System">
        <Menu.Item key="dark">Dark Mode</Menu.Item>
        <Menu.Item key="exit">Confirm Exit</Menu.Item>
        <Menu.Item key="standby">Standby Timeout</Menu.Item>
        <Menu.Item key="timestamps">Timestamps</Menu.Item>
        <Menu.Item key="announcements">Announcements</Menu.Item>
        <Menu.Item key="listings">Directory Listings</Menu.Item>
      </SubMenu>
      <SubMenu key="licenses" icon={<Icon name="key" />} title="Licenses">
        <Menu.Item key="buy">Buy a License</Menu.Item>
        <Menu.Item key="manage">Managed Licenses</Menu.Item>
        <Menu.Item key="projects">Licensed Projects</Menu.Item>
      </SubMenu>
      <SubMenu
        key="purchases"
        icon={<Icon name="credit-card" />}
        title="Purchases"
      >
        <Menu.Item key="payment">Payment Methods</Menu.Item>
        <Menu.Item key="subscriptions">Subscriptions</Menu.Item>
        <Menu.Item key="receipts">Invoices/Receipts</Menu.Item>
      </SubMenu>
      <SubMenu key="support" icon={<Icon name="medkit" />} title="Support">
        <Menu.Item key="tickets">Tickets</Menu.Item>
      </SubMenu>
    </Menu>
  );
}
