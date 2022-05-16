import { Alert, Layout } from "antd";
import InPlaceSignInOrUp from "components/auth/in-place-sign-in-or-up";
import Anonymous from "components/misc/anonymous";
import Loading from "components/share/loading";
import useProfile from "lib/hooks/profile";
import { useRouter } from "next/router";
import HowUsed from "./how-used";
import LicensedProjects from "./licensed-projects";
import ManagedLicenses from "./managed";
import Menu from "./menu";
import Overview from "./overview";

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
    return <Anonymous />;
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
        {body()}
      </Content>
    </Layout>
  );
}
