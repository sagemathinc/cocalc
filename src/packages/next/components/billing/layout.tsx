/*
 *  This file is part of CoCalc: Copyright © 2021 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { unreachable } from "@cocalc/util/misc";
import { COLORS } from "@cocalc/util/theme";
import { Alert, Layout } from "antd";
import InPlaceSignInOrUp from "components/auth/in-place-sign-in-or-up";
import Loading from "components/share/loading";
import { MAX_WIDTH } from "lib/config";
import useProfile from "lib/hooks/profile";
import useCustomize from "lib/use-customize";
import { useRouter } from "next/router";
import { MainPagesType } from "./consts";
import InvoicesAndReceipts from "./invoices-and-receipts";
import Menu from "./menu";
import Overview from "./overview";
import PaymentMethods from "./payment-methods";
import Subscriptions from "./subscriptions";

const { Content } = Layout;

interface Props {
  page: [MainPagesType | undefined]; // empty array is the overview page
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
        message="Billing is not enabled for this server."
      />
    );
  }
  if (!profile) {
    return <Loading large center />;
  }
  const { account_id } = profile;

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

  // page could be an empty array, then main is undefined → overview page
  const [main] = page;

  function body() {
    // main must be in MainPages defined in [[..page]].tsx
    if (main == null) return <Overview />;
    switch (main) {
      case "cards":
        return <PaymentMethods />;
      case "subscriptions":
        return <Subscriptions />;
      case "receipts":
        return <InvoicesAndReceipts />;
      default:
        unreachable(main);
    }
  }

  // this layout is the same as ../store/index.tsx
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
