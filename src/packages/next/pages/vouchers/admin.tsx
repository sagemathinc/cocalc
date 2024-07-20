/*
 *  This file is part of CoCalc: Copyright © 2023 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { useCallback, useMemo, useState } from "react";
import Footer from "components/landing/footer";
import Header from "components/landing/header";
import Head from "components/landing/head";
import { Alert, Button, Card, Checkbox, Layout, Space, Table } from "antd";
import withCustomize from "lib/with-customize";
import { Customize } from "lib/customize";
import { Icon } from "@cocalc/frontend/components/icon";
import A from "components/misc/A";
import InPlaceSignInOrUp from "components/auth/in-place-sign-in-or-up";
import useProfile from "lib/hooks/profile";
import { useRouter } from "next/router";
import Loading from "components/share/loading";
import useDatabase from "lib/hooks/database";
import { field_cmp } from "@cocalc/util/misc";
import type { Voucher } from "@cocalc/util/db-schema/vouchers";
import apiPost from "lib/api/post";
import Help from "components/vouchers/help";

const QUERY = {
  crm_vouchers: [
    {
      id: null,
      when_pay: null,
      created: null,
      active: null,
      expire: null,
      cancel_by: null,
      title: null,
      count: null,
      cost: null,
      tax: null,
      cart: null,
      purchased: null,
    },
  ],
} as const;

import { COLUMNS as COLUMNS0 } from "./created";
const COLUMNS = COLUMNS0.concat([
  {
    title: "When Pay",
    dataIndex: "when_pay",
    key: "when_pay",
  },
  {
    title: "Purchased",
    dataIndex: "purchased",
    key: "purchased",
    render: (_, { purchased }) => (
      <pre style={{ maxWidth: "200px", overflow: "auto" }}>
        {JSON.stringify(purchased, undefined, 2)}
      </pre>
    ),
  },
]);

export default function Created({ customize }) {
  const { loading, value, error, setError, query } = useDatabase(QUERY);
  const profile = useProfile({ noCache: true });
  const router = useRouter();
  const [showExpiredOnly, setShowExpiredOnly] = useState<boolean>(false);
  const [showAdminOnly, setShowAdminOnly] = useState<boolean>(false);
  const [showPaidOnly, setShowPaidOnly] = useState<boolean>(false);

  const [charging, setCharging] = useState<boolean>(false);
  const [result, setResult] = useState<any>(null);

  const doInvoiceUnpaid = useCallback(() => {
    setCharging(true);
    (async () => {
      try {
        setResult(await apiPost("/vouchers/charge-for-unpaid-vouchers"));
      } catch (err) {
        setError(`${err}`);
      } finally {
        setCharging(false);
        query(QUERY);
      }
    })();
  }, []);

  const data: Voucher[] = useMemo(() => {
    if (error) return [];
    const cmp = field_cmp("created");
    let v: Voucher[] = (value?.crm_vouchers ?? []).sort((a, b) => -cmp(a, b));
    if (showExpiredOnly) {
      const now = new Date();
      v = v.filter((x) => new Date(x.expire) <= now);
    }
    if (showPaidOnly) {
      v = v.filter((x) => x.purchased != null);
    }
    if (showAdminOnly) {
      v = v.filter((x) => x.when_pay == "admin");
    }

    return v;
  }, [
    value,
    showExpiredOnly,
    showPaidOnly,
    showAdminOnly,
    error,
  ]);

  return (
    <Customize value={customize}>
      <Head title="Admin: Voucher Payment Status" />
      <Layout>
        <Header />
        <Layout.Content style={{ background: "white" }}>
          {profile != null && !profile.is_admin && (
            <div>
              <Alert
                showIcon
                style={{ margin: "30px" }}
                type="warning"
                message={<b>This page is only for system administrators.</b>}
              />
            </div>
          )}
          <div
            style={{
              width: "100%",
              margin: "10vh 0",
              display: "flex",
              justifyContent: "center",
            }}
          >
            {profile == null && <Loading />}
            {profile != null && !profile.account_id && (
              <Card>
                <div style={{ fontSize: "75px", textAlign: "center" }}>
                  <Icon name="gift2"/>
                </div>
                <InPlaceSignInOrUp
                  title="Voucher Status"
                  why="as an ADMIN to see voucher payment status"
                  style={{ width: "450px" }}
                  onSuccess={() => {
                    router.reload();
                  }}
                />
              </Card>
            )}
            {profile?.account_id && (
              <Card style={{ background: "#fafafa" }}>
                <Space direction="vertical" align="center">
                  <A href="/vouchers">
                    <Icon name="gift2" style={{ fontSize: "75px" }} />
                  </A>
                  <h1>
                    <Icon name="users" /> Admin -- Voucher Payment Status (
                    {data.length})
                  </h1>
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
                  {loading && <Loading />}
                  {!loading && (
                    <div>
                      <Checkbox
                        disabled={charging}
                        checked={showExpiredOnly}
                        onClick={() => setShowExpiredOnly(!showExpiredOnly)}
                      >
                        Show expired only
                      </Checkbox>
                      <Checkbox
                        disabled={charging}
                        checked={showAdminOnly}
                        onClick={() => setShowAdminOnly(!showAdminOnly)}
                      >
                        Show admin only
                      </Checkbox>
                      <Checkbox
                        disabled={charging}
                        checked={showPaidOnly}
                        onClick={() => setShowPaidOnly(!showPaidOnly)}
                      >
                        Show paid only
                      </Checkbox>
                      <div style={{ maxWidth: "600px", marginTop: "15px" }}>
                        NOTE: Click the unpaid and expired checkboxes to bring
                        up the button to manually run invoicing. This is
                        temporary until we automate this later.
                      </div>
                    </div>
                  )}
                  {!loading  && showExpiredOnly && (
                    <div>
                      <Button
                        style={{ marginTop: "30px" }}
                        type="primary"
                        onClick={doInvoiceUnpaid}
                        disabled={charging || data.length == 0}
                      >
                        {charging && (
                          <>
                            <Loading />{" "}
                          </>
                        )}
                        Create Invoices and Charge for the {data.length} Unpaid
                        Vouchers
                      </Button>
                      {result && (
                        <div>
                          Invoice Result:
                          <pre>{JSON.stringify(result, undefined, 2)}</pre>
                        </div>
                      )}
                    </div>
                  )}
                  {!loading && data.length > 0 && (
                    <Table
                      columns={COLUMNS}
                      dataSource={data}
                      rowKey="id"
                      pagination={{ defaultPageSize: 50 }}
                    />
                  )}
                  {!loading && data.length == 0 && (
                    <div>There are no matching vouchers.</div>
                  )}
                  <Help />
                </Space>
              </Card>
            )}
          </div>
          <Footer />
        </Layout.Content>
      </Layout>
    </Customize>
  );
}

export async function getServerSideProps(context) {
  return await withCustomize({ context });
}
