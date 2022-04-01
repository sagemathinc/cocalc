import { Alert, Layout } from "antd";
import A from "components/misc/A";
import { join } from "path";
import basePath from "lib/base-path";
import Menu from "./menu";
import InPlaceSignInOrUp from "components/auth/in-place-sign-in-or-up";
import useProfile from "lib/hooks/profile";
import Loading from "components/share/loading";
import { useRouter } from "next/router";
import SiteName from "components/share/site-name";
import useCustomize from "lib/use-customize";
import Cart from "./cart";
import SiteLicense from "./site-license";
import Overview from "./overview";
import Checkout from "./checkout";
import Congrats from "./congrats";
import Anonymous from "components/misc/anonymous";

const { Content } = Layout;

interface Props {
  page: string;
}

export default function ConfigLayout({ page }: Props) {
  const { isCommercial } = useCustomize();
  const router = useRouter();
  const profile = useProfile({ noCache: true });

  if (!isCommercial) {
    return (
      <Alert
        showIcon
        style={{
          margin: "30px auto",
          maxWidth: "400px",
          fontSize: "12pt",
          padding: "15px 30px",
        }}
        type="warning"
        message={
          <>
            The <SiteName /> store is not enabled.
          </>
        }
      />
    );
  }
  if (!profile) {
    return <Loading large center />;
  }
  const { account_id, is_anonymous } = profile;

  if (!account_id) {
    return (
      <Alert
        style={{ margin: "15px auto" }}
        type="warning"
        message={
          <InPlaceSignInOrUp
            title="Account Configuration"
            why="to shop in the store"
            onSuccess={() => {
              router.reload();
            }}
          />
        }
      />
    );
  }

  if (is_anonymous) {
    return <Anonymous />;
  }

  const [main] = page;

  function body() {
    switch (main) {
      case "site-license":
        return <SiteLicense />;
      case "cart":
        return <Cart />;
      case "checkout":
        return <Checkout />;
      case "congrats":
        return <Congrats />;
    }
    return <Overview />;
  }

  return (
    <Layout
      style={{
        padding: "0 24px 24px",
        backgroundColor: "white",
        color: "#555",
      }}
    >
      <Menu main={main} />
      <Content
        style={{
          padding: 24,
          margin: 0,
          minHeight: 280,
        }}
      >
        {main == "overview" && (
          <div style={{ float: "right", margin: "0 0 15px 15px" }}>
            <Alert
              type="warning"
              message={
                <>
                  This is the new <SiteName /> store (
                  <A href={join(basePath, "settings", "licenses")} external>
                    the old page
                  </A>
                  ).
                </>
              }
            />
          </div>
        )}
        {body()}
      </Content>
    </Layout>
  );
}
