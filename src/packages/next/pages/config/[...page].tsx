import { Layout, Menu, Input, Alert } from "antd";
import { Icon } from "@cocalc/frontend/components/icon";
import Header from "components/landing/header";
import Config from "components/account/config";
import { Customize } from "lib/customize";
import withCustomize from "lib/with-customize";
import { useRouter } from "next/router";
import A from "components/misc/A";
import { join } from "path";
import basePath from "lib/base-path";

const { SubMenu } = Menu;
const { Content, Sider } = Layout;

export default function Preferences({ customize, page }) {
  const router = useRouter();
  const [main, sub] = page;
  return (
    <Customize value={customize}>
      <Layout>
        <Header />
        <Layout>
          <Sider width={200}>
            <Menu
              mode="inline"
              defaultOpenKeys={[main]}
              defaultSelectedKeys={[sub]}
              style={{ height: "100%", borderRight: 0 }}
              onSelect={(e) => {
                const [sub, main] = e.keyPath;
                router.push(`/config/${main}/${sub}`, undefined, {
                  scroll: false,
                });
              }}
            >
              <Input.Search
                placeholder="Search config..."
                onSearch={(x) => console.log(x)}
                style={{ width: 190, margin: "5px" }}
              />
              <SubMenu
                key="account"
                icon={<Icon name="user" />}
                title="Account"
              >
                <Menu.Item key="name">Name</Menu.Item>
                <Menu.Item key="email">Email Address</Menu.Item>
                <Menu.Item key="avatar">Avatar Image</Menu.Item>
                <Menu.Item key="link">Link Account</Menu.Item>
                <Menu.Item key="ssh">SSH Keys</Menu.Item>
                <Menu.Item key="api">API Key</Menu.Item>
                <Menu.Item key="delete">Delete Account</Menu.Item>
                <Menu.Item key="sign-out">Sign Out</Menu.Item>
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
              <SubMenu
                key="licenses"
                icon={<Icon name="key" />}
                title="Licenses"
              >
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
              <SubMenu
                key="support"
                icon={<Icon name="medkit" />}
                title="Support"
              >
                <Menu.Item key="tickets">Tickets</Menu.Item>
              </SubMenu>
            </Menu>
          </Sider>
          <Layout
            style={{
              padding: "0 24px 24px",
              backgroundColor: "white",
              color: "#666",
            }}
          >
            <Content
              style={{
                padding: 24,
                margin: 0,
                minHeight: 280,
              }}
            >
              <Alert
                style={{margin:'15px auto', maxWidth:'600px'}}
                message={<b>Under Constructions</b>}
                description={
                  <>
                    This page is under construction. To configure your CoCalc
                    account, visit{" "}
                    <A href={join(basePath, "settings")} external>
                      Account Preferences
                    </A>
                    .
                  </>
                }
                type="warning"
                showIcon
              />
              <Config main={main} sub={sub} />
            </Content>
          </Layout>
        </Layout>
      </Layout>
    </Customize>
  );
}

export async function getServerSideProps(context) {
  const { page } = context.params;

  return await withCustomize({ context, props: { page } });
}
