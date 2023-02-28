/*
 *  This file is part of CoCalc: Copyright © 2023 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { useState } from "react";
import Footer from "components/landing/footer";
import Header from "components/landing/header";
import Head from "components/landing/head";
import { Alert, Button, Card, Divider, Input, Layout, Space } from "antd";
import withCustomize from "lib/with-customize";
import { Customize } from "lib/customize";
import { Icon } from "@cocalc/frontend/components/icon";
import A from "components/misc/A";
import InPlaceSignInOrUp from "components/auth/in-place-sign-in-or-up";
import useProfile from "lib/hooks/profile";
import { useRouter } from "next/router";

export default function Redeem({ customize }) {
  const [code, setCode] = useState<string>("");
  const [error, setError] = useState<string>("");
  const { account_id, email_address } = useProfile({ noCache: true }) ?? {};
  const [signedIn, setSignedIn] = useState<boolean>(!!account_id);
  const router = useRouter();
  return (
    <Customize value={customize}>
      <Head title="Redeem Voucher" />
      <Layout>
        <Header />
        <Layout.Content
          style={{
            backgroundColor: "white",
          }}
        >
          <div
            style={{
              width: "100%",
              margin: "15vh 0",
              display: "flex",
              justifyContent: "center",
            }}
          >
            {!account_id && !signedIn && (
              <Card style={{ textAlign: "center" }}>
                <Icon name="gift2" style={{ fontSize: "75px" }} />
                <InPlaceSignInOrUp
                  why="to Redeem a Voucher"
                  style={{ fontSize: "14pt", width: "450px" }}
                  onSuccess={() => {
                    router.push("/redeem");
                    setSignedIn(true);
                  }}
                />
              </Card>
            )}
            {(account_id || signedIn) && (
              <Card style={{ background: "#fafafa" }}>
                {error && (
                  <Alert
                    type="error"
                    message={error}
                    showIcon
                    style={{ width: "100%", marginBottom: "30px" }}
                    closable
                    onClose={() => setError("")}
                  />
                )}
                <Space direction="vertical" align="center">
                  <Icon name="gift2" style={{ fontSize: "75px" }} />
                  <h1>Enter Voucher Code</h1>
                  <Input
                    autoFocus
                    size="large"
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    style={{ width: "300px", marginBottom: "15px" }}
                  />
                  <Button
                    size="large"
                    type="primary"
                    disabled={code.length < 8}
                    onClick={() => {}}
                  >
                    Redeem
                  </Button>
                  <Divider orientation="left" style={{ width: "400px" }}>
                    Vouchers
                  </Divider>
                  <div
                    style={{
                      color: "#666",
                      maxWidth: "400px",
                    }}
                  >
                    When you redeem a voucher, one or more{" "}
                    <A href="https://doc.cocalc.com/licenses.html">licenses</A>{" "}
                    will be added to your account
                    {email_address != null ? (
                      <A href="/config/account/email">{` ${email_address}`}</A>
                    ) : (
                      ""
                    )}
                    . You can then use{" "}
                    <A href="/licenses/managed">your licenses</A> to{" "}
                    <A href="https://doc.cocalc.com/add-lic-project.html">
                      upgrade your projects
                    </A>
                    . If you have any questions,{" "}
                    <A href="/support">contact support</A> and include your
                    voucher code.
                  </div>
                </Space>
              </Card>
            )}
          </div>
          <Footer />
        </Layout.Content>{" "}
      </Layout>
    </Customize>
  );
}

export async function getServerSideProps(context) {
  return await withCustomize({ context });
}
