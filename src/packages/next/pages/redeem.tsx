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
import License from "components/licenses/license";
import type { CreatedItem } from "@cocalc/server/vouchers/redeem";
import { currency } from "@cocalc/util/misc";

type State = "input" | "redeeming" | "redeemed";

export default function Redeem({ customize }) {
  const isMounted = useIsMounted();
  const [code, setCode] = useState<string>("");
  const [error, setError] = useState<string>("");
  const [state, setState] = useState<State>("input");
  const profile = useProfile({ noCache: true });
  const [signedIn, setSignedIn] = useState<boolean>(!!profile?.account_id);
  const router = useRouter();
  const [createdItems, setCreatedItems] = useState<CreatedItem[] | null>(null);

  // optional project_id to automatically apply all the licenses we get on redeeming the voucher
  const { project_id } = router.query;

  async function redeemCode() {
    try {
      setError("");
      setState("redeeming");
      // This api call tells the backend, "create requested vouchers from everything in my
      // shopping cart that is not a subscription."
      const createdItems = await apiPost("/vouchers/redeem", {
        code: code.trim(),
        project_id,
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
                        <DisplayCreatedItems
                          createdItems={createdItems}
                          project_id={project_id}
                        />
                      }
                    />
                  )}
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
                              The license provided by this voucher will be
                              automatically applied to your project{" "}
                              <Project project_id={project_id} />.
                            </>
                          )}
                          {state == "redeeming" && (
                            <>
                              Redeeming the voucher and applying the license it
                              to your project{" "}
                              <Project project_id={project_id} />
                              ...
                            </>
                          )}
                          {state == "redeemed" && createdItems != null && (
                            <DisplayCreatedItems
                              createdItems={createdItems}
                              project_id={project_id}
                            />
                          )}
                        </div>
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
                        money
                      </A>{" "}
                      or{" "}
                      <A href="/settings/licenses" external>
                        licenses
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
                        money
                      </A>{" "}
                      to make purchases, or the{" "}
                      <A href="/settings/licenses" external>
                        licenses
                      </A>{" "}
                      to{" "}
                      <A href="https://doc.cocalc.com/add-lic-project.html">
                        upgrade your projects.
                      </A>{" "}
                      If a license doesn't fit your needs, you can{" "}
                      <A href="/settings/licenses" external>
                        easily edit it here
                      </A>{" "}
                      including receiving a prorated refund so you can buy
                      something else, or paying a little more for a more
                      powerful license.
                    </p>
                    <p>
                      You can browse{" "}
                      <A href="/vouchers/redeemed">
                        all vouchers you have already redeemed.
                      </A>{" "}
                      If in a project's settings you click "Redeem Voucher" and
                      enter a voucher code you already redeemed, then the
                      corresponding licenses will get added to that project.
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

function DisplayCreatedItems({ createdItems, project_id }) {
  if (createdItems == null) {
    return null;
  }
  return (
    <ol>
      {createdItems.map((item, n) => (
        <DisplayCreatedItem item={item} project_id={project_id} key={n} />
      ))}
    </ol>
  );
}

function DisplayCreatedItem({ item, project_id }) {
  if (item.type == "cash") {
    return (
      <li>
        {currency(item.amount)} was credited{" "}
        <A href="/settings/purchases" external>
          to your account
        </A>{" "}
        (transaction id: {item.purchase_id})
      </li>
    );
  } else if (item.type == "license") {
    return (
      <li>
        The following license <License license_id={item.license_id} /> was added{" "}
        <A href="/settings/licenses" external>
          to your licenses
        </A>
        .
        {!!project_id && (
          <>
            {" "}
            This license was applied to the project{" "}
            <Project project_id={project_id} />.
          </>
        )}
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
