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

type State = "input" | "redeeming" | "redeemed";

export default function Redeem({ customize }) {
  const isMounted = useIsMounted();
  const [code, setCode] = useState<string>("");
  const [error, setError] = useState<string>("");
  const [state, setState] = useState<State>("input");
  const { account_id, email_address } = useProfile({ noCache: true }) ?? {};
  const [signedIn, setSignedIn] = useState<boolean>(!!account_id);
  const router = useRouter();

  // optional project_id to automatically apply all the licenses we get on redeeming the voucher
  const { project_id } = router.query;

  async function redeemCode() {
    try {
      setError("");
      setState("redeeming");
      // This api call tells the backend, "create requested vouchers from everything in my
      // shopping cart that is not a subscription."
      await apiPost("/vouchers/redeem", { code: code.trim(), project_id });
      if (!isMounted.current) return;
      // success!
      setState("redeemed");
    } catch (err) {
      // The redeem failed.
      setError(err.message);
      setState("input"); // back to input mode
    } finally {
      if (!isMounted.current) return;
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
              margin: "10vh 0",
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
                    disabled={state != "input"}
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
                  <Button
                    disabled={code.length < 8 || state != "input" || !!error}
                    size="large"
                    type="primary"
                    onClick={redeemCode}
                  >
                    {state == "input" && <>Redeem</>}
                    {state == "redeeming" && (
                      <Loading delay={0}>Redeeming...</Loading>
                    )}
                    {state == "redeemed" && <>Success!</>}
                  </Button>
                  {project_id && (
                    <Alert
                      showIcon
                      style={{ marginTop: "30px" }}
                      type={
                        {
                          input: "info",
                          redeeming: "warning",
                          redeemed: "success",
                        }[state] as "info" | "warning" | "success"
                      }
                      message={
                        <div style={{ maxWidth: "340px" }}>
                          {state == "input" && (
                            <>
                              The voucher will be applied to your project{" "}
                              <Project project_id={project_id} /> automatically.
                            </>
                          )}
                          {state == "redeeming" && (
                            <>
                              Redeeming the voucher and applying it to your
                              project <Project project_id={project_id} />
                              ...
                            </>
                          )}
                          {state == "redeemed" && (
                            <>
                              The voucher was applied to your project{" "}
                              <Project project_id={project_id} />.
                            </>
                          )}
                        </div>
                      }
                    />
                  )}{" "}
                  {state == "redeemed" && (
                    <div style={{ textAlign: "center", marginTop: "15px" }}>
                      <Button
                        onClick={() => {
                          setState("input");
                          setCode("");
                          setError("");
                        }}
                      >
                        Redeem Another Voucher
                      </Button>
                    </div>
                  )}
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
