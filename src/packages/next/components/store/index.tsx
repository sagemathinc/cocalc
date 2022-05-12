/*
 *  This file is part of CoCalc: Copyright © 2022 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { COLORS } from "@cocalc/util/theme";
import { Alert, Layout } from "antd";
import InPlaceSignInOrUp from "components/auth/in-place-sign-in-or-up";
import Anonymous from "components/misc/anonymous";
import Loading from "components/share/loading";
import SiteName from "components/share/site-name";
import useProfile from "lib/hooks/profile";
import useCustomize from "lib/use-customize";
import { useRouter } from "next/router";
import { useEffect } from "react";
import Boost from "./boost";
import Cart from "./cart";
import Checkout from "./checkout";
import Congrats from "./congrats";
import DedicatedResource from "./dedicated";
import Menu from "./menu";
import Overview from "./overview";
import SiteLicense from "./site-license";
import { MAX_WIDTH } from "lib/config";

const { Content } = Layout;

interface Props {
  page: string;
}

export default function StoreLayout({ page }: Props) {
  const { isCommercial } = useCustomize();
  const router = useRouter();
  const profile = useProfile({ noCache: true });

  useEffect(() => {
    router.prefetch("/store/site-license");
  }, []);

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
      case "boost":
        return <Boost />;
      case "dedicated":
        return <DedicatedResource />;
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
