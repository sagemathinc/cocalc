/*
 *  This file is part of CoCalc: Copyright © 2022 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Alert, Layout } from "antd";

import { COLORS } from "@cocalc/util/theme";
import InPlaceSignInOrUp from "components/auth/in-place-sign-in-or-up";
import Anonymous from "components/misc/anonymous";
import Loading from "components/share/loading";
import { MAX_WIDTH } from "lib/config";
import useProfile from "lib/hooks/profile";
import Error from "next/error";
import { useRouter } from "next/router";
import HowUsed from "./how-used";
import LicensedProjects from "./licensed-projects";
import ManagedLicenses from "./managed";
import Menu from "./menu";
import Overview from "./overview";

const { Content } = Layout;

interface Props {
  page: ("projects" | "how-used" | "managed" | undefined)[];
}

export default function LicensesLayout({ page }: Props) {
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
    if (main == null) return <Overview />;
    switch (main) {
      case "projects":
        return <LicensedProjects />;
      case "managed":
        return <ManagedLicenses />;
      case "how-used":
        return <HowUsed account_id={account_id} />;
      default:
        return <Error statusCode={404} />;
    }
  }

  // this is layout the same way as ../store/index.tsx
  return (
    <Layout
      style={{
        padding: "0 24px 24px",
        backgroundColor: "white",
        color: COLORS.GRAY_D,
      }}
    >
      <Content
        style={{
          margin: 0,
          minHeight: "60vh",
        }}
      >
        <div style={{ maxWidth: MAX_WIDTH, margin: "auto" }}>
          <Menu main={main} />
          {body()}
        </div>
      </Content>
    </Layout>
  );
}
