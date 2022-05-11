import { Alert, Layout } from "antd";
import A from "components/misc/A";
import { join } from "path";
import basePath from "lib/base-path";
import Menu from "./menu";
import InPlaceSignInOrUp from "components/auth/in-place-sign-in-or-up";
import useProfile from "lib/hooks/profile";
import Loading from "components/share/loading";
import { useRouter } from "next/router";
import LicensedProjects from "./licensed-projects";
import ManagedLicenses from "./managed";
import HowUsed from "./how-used";
import Overview from "./overview";
import Anonymous from "components/misc/anonymous";

const { Content } = Layout;

interface Props {
  page: string;
}

export default function ConfigLayout({ page }: Props) {
  const router = useRouter();
  const profile = useProfile({ noCache: true });
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
            why="to see information about your licenses"
            onSuccess={() => {
              router.reload();
            }}
          />
        }
      />
    );
  }

  if (is_anonymous) {
    return <Anonymous/>;
  }

  const [main] = page;

  function body() {
    switch (main) {
      case "projects":
        return <LicensedProjects />;
      case "managed":
        return <ManagedLicenses />;
      case "how-used":
        return <HowUsed account_id={account_id} />;
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
        <div style={{ float: "right", margin: "0 0 15px 15px" }}>
          <Alert
            type="warning"
            message={
              <>
                This is the new licenses page (
                <A href={join(basePath, "settings", "licenses")} external>
                  the old page
                </A>
                ).
              </>
            }
          />
        </div>
        {body()}
      </Content>
    </Layout>
  );
}
