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
import apiPost from "lib/api/post";
import useIsMounted from "lib/hooks/mounted";
import Loading from "components/share/loading";
import Project from "components/project/link";

export default function Redeem({ customize }) {
  const isMounted = useIsMounted();
  const [code, setCode] = useState<string>("");
  const [error, setError] = useState<string>("");
  const [redeemingVoucher, setRedeemingVoucher] = useState<boolean>(false);
  const { account_id, email_address } = useProfile({ noCache: true }) ?? {};
  const [signedIn, setSignedIn] = useState<boolean>(!!account_id);
  const router = useRouter();

  // optional project_id to automatically apply all the licenses we get on redeeming the voucher
  const { project_id } = router.query;

  async function redeemCode() {
    try {
      setError("");
      setRedeemingVoucher(true);
      // This api call tells the backend, "create requested vouchers from everything in my
      // shopping cart that is not a subscription."
      await apiPost("/vouchers/redeem", { code: code.trim(), project_id });
      if (!isMounted.current) return;
    } catch (err) {
      // The redeem failed.
      setError(err.message);
    } finally {
      if (!isMounted.current) return;
      setRedeemingVoucher(false);
    }
  }

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
                <Space direction="vertical" align="center">
                  <Icon name="gift2" style={{ fontSize: "75px" }} />
                  <h1>Enter Voucher Code</h1>
                  <Input
                    allowClear
                    autoFocus
                    size="large"
                    value={code}
                    onChange={(e) => {
                      setCode(e.target.value);
                      setError("");
                    }}
                    onPressEnter={redeemCode}
                    style={{ width: "300px", marginBottom: "15px" }}
                  />
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
                  {!error && (
                    <Button
                      disabled={code.length < 8 || redeemingVoucher}
                      size="large"
                      type="primary"
                      onClick={redeemCode}
                    >
                      {redeemingVoucher ? (
                        <Loading delay={0}>Redeeming...</Loading>
                      ) : (
                        <>Redeem</>
                      )}
                    </Button>
                  )}
                  {project_id && (
                    <Alert
                      showIcon
                      style={{ marginTop: "30px" }}
                      type="info"
                      message={
                        <div style={{ maxWidth: "450px" }}>
                          The voucher will be applied to the project{" "}
                          <Project project_id={project_id} /> automatically.
                        </div>
                      }
                    />
                  )}{" "}
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
