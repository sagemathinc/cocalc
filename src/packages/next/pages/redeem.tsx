/*
 *  This file is part of CoCalc: Copyright © 2023 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
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
import type { CreatedItem } from "@cocalc/server/vouchers/redeem";
import { currency } from "@cocalc/util/misc";

type State = "input" | "redeeming" | "redeemed";

interface Props {
  customize;
  id?: string;
}

export default function Redeem({ customize, id }: Props) {
  const isMounted = useIsMounted();
  const [code, setCode] = useState<string>(id ?? "");
  const [error, setError] = useState<string>("");
  const [state, setState] = useState<State>("input");
  const profile = useProfile({ noCache: true });
  const [signedIn, setSignedIn] = useState<boolean>(!!profile?.account_id);
  const router = useRouter();
  const [createdItems, setCreatedItems] = useState<CreatedItem[] | null>(null);

  async function redeemCode() {
    try {
      setError("");
      setState("redeeming");
      // This api call tells the backend, "create requested vouchers from everything in my
      // shopping cart that is not a subscription."
      const v = code.split("/");
      const c = v[v.length - 1]?.trim();
      const createdItems = await apiPost("/vouchers/redeem", {
        code: c,
      });
      if (!isMounted.current) return;
      setCreatedItems(createdItems);
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
            {profile == null && <Loading />}
            {profile != null && !profile.account_id && !signedIn && (
              <Card>
                <div style={{ fontSize: "75px", textAlign: "center" }}>
                  <Icon name="gift2" />
                </div>
                <InPlaceSignInOrUp
                  title="Redeem Voucher"
                  why="to redeem a voucher"
                  style={{ width: "450px" }}
                  onSuccess={() => {
                    router.push("/redeem");
                    setSignedIn(true);
                  }}
                />
              </Card>
            )}

            {(profile?.account_id || signedIn) && (
              <Card style={{ background: "#fafafa" }}>
                <Space direction="vertical" align="center">
                  <A href="/vouchers">
                    <Icon name="gift2" style={{ fontSize: "75px" }} />
                  </A>
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
                      message={"Error"}
                      description={error}
                      showIcon
                      style={{ width: "100%", marginBottom: "30px" }}
                      closable
                      onClose={() => setError("")}
                    />
                  )}
                  {state != "redeemed" ? (
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
                    </Button>
                  ) : (
                    <Alert
                      showIcon
                      message={
                        "Success!  You redeemed the voucher, which added the following to your account:"
                      }
                      type="success"
                      description={
                        <DisplayCreatedItems createdItems={createdItems} />
                      }
                    />
                  )}
                  {state == "redeemed" && (
                    <div style={{ textAlign: "center", marginTop: "15px" }}>
                      <Button
                        onClick={() => {
                          setState("input");
                          setCode("");
                          setError("");
                          setCreatedItems(null);
                        }}
                      >
                        Redeem Another Voucher
                      </Button>
                    </div>
                  )}
                  <Divider orientation="left" style={{ width: "400px" }}>
                    <A href="https://doc.cocalc.com/vouchers.html">
                      <Icon name="medkit" /> Vouchers
                    </A>
                  </Divider>
                  <div
                    style={{
                      color: "#666",
                      maxWidth: "450px",
                    }}
                  >
                    <p>
                      When you redeem a voucher code,{" "}
                      <A href="/settings/purchases" external>
                        credit
                      </A>{" "}
                      will be added to your account
                      {profile?.email_address != null ? (
                        <A href="/config/account/email">{` ${profile?.email_address}`}</A>
                      ) : (
                        ""
                      )}
                      .
                    </p>
                    <p>
                      Once you redeem a voucher code, you can use the
                      corresponding{" "}
                      <A href="/settings/purchases" external>
                        credit
                      </A>{" "}
                      to make purchases.
                    </p>
                    <p>
                      You can browse{" "}
                      <A href="/vouchers/redeemed">
                        all vouchers you have already redeemed.
                      </A>{" "}
                    </p>
                    <p>
                      If you have any questions,{" "}
                      <A href="/support">contact support</A> and{" "}
                      <A href="https://doc.cocalc.com/vouchers.html">
                        read the documentation
                      </A>
                      .
                    </p>

                    <div style={{ textAlign: "center" }}>
                      <A href="/vouchers">
                        <b>The Voucher Center</b>
                      </A>
                    </div>
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

function DisplayCreatedItems({ createdItems }) {
  if (createdItems == null) {
    return null;
  }
  return (
    <ol>
      {createdItems.map((item, n) => (
        <DisplayCreatedItem item={item} key={n} />
      ))}
    </ol>
  );
}

function DisplayCreatedItem({ item }) {
  if (item.type == "cash") {
    return (
      <li>
        {currency(item.amount)} was credited{" "}
        <A href={`/settings/purchases#id=${item.purchase_id}`} external>
          to your account
        </A>{" "}
        (Id: {item.purchase_id})
      </li>
    );
  } else {
    return (
      <li>
        <pre>{JSON.stringify(item)}</pre>
      </li>
    );
  }
}

export async function getServerSideProps(context) {
  return await withCustomize({ context });
}
