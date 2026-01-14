/*
 *  This file is part of CoCalc: Copyright © 2022 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */
import { Alert, Layout } from "antd";
import { useEffect, useState, type JSX } from "react";

import * as purchasesApi from "@cocalc/frontend/purchases/api";
import { COLORS } from "@cocalc/util/theme";
import Anonymous from "components/misc/anonymous";
import Loading from "components/share/loading";
import SiteName from "components/share/site-name";
import { StoreBalanceContext } from "lib/balance";
import { MAX_WIDTH } from "lib/config";
import useProfile from "lib/hooks/profile";
import useCustomize from "lib/use-customize";
import Cart from "./cart";
import Checkout from "./checkout";
import Congrats from "./congrats";
import Menu from "./menu";
import Memberships from "./memberships";
import Overview from "./overview";
import Processing from "./processing";
import SiteLicense from "./site-license";
import { StoreInplaceSignInOrUp } from "./store-inplace-signup";
import { StorePagesTypes } from "./types";
import Vouchers from "./vouchers";

const { Content } = Layout;

interface Props {
  page: (StorePagesTypes | undefined)[];
}

export default function StoreLayout({ page }: Props) {
  const { isCommercial } = useCustomize();
  const profile = useProfile({ noCache: true });

  const [loading, setLoading] = useState<boolean>(false);

  const [balance, setBalance] = useState<number>();

  const refreshBalance = async () => {
    if (!profile || !profile.account_id) {
      setBalance(undefined);
      return;
    }

    // Set balance if user is logged in
    //
    try {
      setLoading(true);
      setBalance(await purchasesApi.getBalance());
    } catch (err) {
      console.warn("Error updating balance", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refreshBalance();
  }, [profile]);

  function renderNotCommercial(): JSX.Element {
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

  if (!isCommercial) {
    return renderNotCommercial();
  }

  if (!profile) {
    return <Loading large center />;
  }
  const { account_id, is_anonymous } = profile;
  const noAccount = account_id == null;

  // wrapper: only the pages showing the prices will be shown to the general public or anonymous users
  function requireAccount(StorePage): JSX.Element {
    if (noAccount) {
      return (
        <Alert
          style={{ margin: "15px auto" }}
          type="warning"
          message={<StoreInplaceSignInOrUp />}
        />
      );
    }

    return <StorePage />;
  }

  const [main] = page;

  function body() {
    if (main == null) return <Overview />;

    if (is_anonymous) {
      return <Anonymous />;
    }

    switch (main) {
      case "membership":
        return requireAccount(Memberships);
      case "course":
        return <SiteLicense noAccount={noAccount} source="course" />;
      case "cart":
        return requireAccount(Cart);
      case "checkout":
        return requireAccount(Checkout);
      case "processing":
        return requireAccount(Processing);
      case "vouchers":
        return requireAccount(Vouchers);
      case "congrats":
        return requireAccount(Congrats);
      default:
        return <Alert type="error" message={`Invalid page ${main}`} />;
    }
  }

  // this layout is the same as ../licenses/layout.tsx and ../billing/layout.tsx
  function renderMain(): JSX.Element {
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
            margin: "0 30px",
            minHeight: "60vh",
          }}
        >
          <div style={{ maxWidth: MAX_WIDTH, margin: "auto" }}>
            <StoreBalanceContext.Provider
              value={{ balance, refreshBalance, loading }}
            >
              <Menu main={main} />
              {body()}
            </StoreBalanceContext.Provider>
          </div>
        </Content>
      </Layout>
    );
  }

  return renderMain();
}
