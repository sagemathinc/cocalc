import { Alert, Divider, Layout, Space } from "antd";
import Config from "components/account/config";
import A from "components/misc/A";
import { join } from "path";
import basePath from "lib/base-path";
import ConfigMenu from "./menu";
import useIsBrowser from "lib/hooks/is-browser";
import useCustomize from "lib/use-customize";
import InPlaceSignInOrUp from "components/auth/in-place-sign-in-or-up";
import { menu } from "./register";
import { Icon } from "@cocalc/frontend/components/icon";
import Search from "./search/component";
import Avatar from "components/account/avatar";
import useProfile from "lib/hooks/profile";
import { capitalize } from "@cocalc/util/misc";

const { Content, Sider } = Layout;

interface Props {
  page: string;
}

export default function ConfigLayout({ page }: Props) {
  const isBrowser = useIsBrowser();
  const { account } = useCustomize();
  const profile = useProfile(account?.account_id);

  if (!account) {
    return (
      <Alert
        style={{ margin: "15px auto" }}
        type="warning"
        message={
          <InPlaceSignInOrUp
            title="Account Configuration"
            why="to edit your account configuration"
          />
        }
      />
    );
  }

  const [main, sub] = page;
  const info = menu[main]?.[sub];
  const content = (
    <Content
      style={{
        padding: 24,
        margin: 0,
        minHeight: 280,
        ...(info.danger
          ? { color: "#ff4d4f", backgroundColor: "#fff1f0" }
          : undefined),
      }}
    >
      <Space style={{ marginBottom: "15px" }}>
        <Avatar
          account_id={account.account_id}
          style={{ marginRight: "15px" }}
        />
        <div style={{ color: "#666" }}>
          <b style={{ fontSize: "13pt" }}>
            {profile?.first_name} {profile?.last_name}
          </b>
          <div>Your account</div>
        </div>
      </Space>
      {main != "search" && <Search />}
      {info && (
        <>
          <h2>
            <Icon name={info.icon} style={{ marginRight: "5px" }} />{" "}
            {capitalize(main)} - {info.title}
          </h2>
          {info.desc}
          <Divider />
        </>
      )}
      {info?.desc?.toLowerCase().includes("todo") && (
        <Alert
          style={{ margin: "15px auto", maxWidth: "600px" }}
          message={<b>Under Constructions</b>}
          description={
            <>
              This page is under construction. To configure your CoCalc account,
              visit{" "}
              <A href={join(basePath, "settings")} external>
                Account Preferences
              </A>
              .
            </>
          }
          type="warning"
          showIcon
        />
      )}
      <Config main={main} sub={sub} />
    </Content>
  );
  return (
    <Layout>
      <Sider width={"25%"} breakpoint="sm" collapsedWidth="0">
        {isBrowser && <ConfigMenu main={main} sub={sub} />}
      </Sider>
      <Layout
        style={{
          padding: "0 24px 24px",
          backgroundColor: "white",
          color: "#555",
        }}
      >
        {content}
      </Layout>
    </Layout>
  );
}
