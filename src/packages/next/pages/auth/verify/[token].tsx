/*
 *  This file is part of CoCalc: Copyright © 2021 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

// Password reset page

import { Layout } from "antd";
import RedeemVerify from "components/auth/redeem-verify-email";
import Footer from "components/landing/footer";
import Head from "components/landing/head";
import Header from "components/landing/header";
import { Customize } from "lib/customize";
import withCustomize from "lib/with-customize";
import { useRouter } from "next/router";

export default function PasswordReset({ token, customize }) {
  const router = useRouter();
  const { email } = router.query;

  return (
    <Customize value={customize}>
      <Head title={"Verify Email Address"} />
      <Layout>
        <Header />
        <Layout.Content style={{ backgroundColor: "white" }}>
          <RedeemVerify token={token} email_address={`${email}`} />
          <Footer />
        </Layout.Content>
      </Layout>
    </Customize>
  );
}

export async function getServerSideProps(context) {
  const { token } = context.params;
  return await withCustomize({
    context,
    props: { token },
  });
}
