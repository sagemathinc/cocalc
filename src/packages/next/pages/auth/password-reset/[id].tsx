/*
 *  This file is part of CoCalc: Copyright © 2021 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

// Password reset page

import { Layout } from "antd";
import RedeemPasswordReset from "components/auth/redeem-password-reset";
import Footer from "components/landing/footer";
import Head from "components/landing/head";
import Header from "components/landing/header";
import { Customize } from "lib/customize";
import withCustomize from "lib/with-customize";

export default function PasswordReset({ passwordResetId, customize }) {
  return (
    <Customize value={customize}>
      <Head title={"Password Reset"} />
      <Layout>
        <Header page="sign-in" subPage="password-reset" />
        <Layout.Content style={{ backgroundColor: "white" }}>
          <RedeemPasswordReset passwordResetId={passwordResetId} />
          <Footer />
        </Layout.Content>
      </Layout>
    </Customize>
  );
}

export async function getServerSideProps(context) {
  const { id } = context.params;
  return await withCustomize({
    context,
    props: { passwordResetId: id },
  });
}
