/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
Voucher -- create vouchers from the contents of your shopping cart.
*/

import {
  Button,
  DatePicker,
  Form,
  Input,
  InputNumber,
  Radio,
  Space,
} from "antd";
import dayjs from "dayjs";
import { useContext, useEffect, useMemo, useState } from "react";
import { Icon } from "@cocalc/frontend/components/icon";
import { plural } from "@cocalc/util/misc";
import A from "components/misc/A";
import SiteName from "components/share/site-name";
import useIsMounted from "lib/hooks/mounted";
import { useRouter } from "next/router";
import { useProfileWithReload } from "lib/hooks/profile";
import { Paragraph, Title } from "components/misc";
import { RequireEmailAddress } from "./checkout";
import ShowError from "@cocalc/frontend/components/error";
import vouchers, {
  CharSet,
  MAX_VOUCHERS,
  MAX_VOUCHER_VALUE,
  WhenPay,
} from "@cocalc/util/vouchers";
import {
  vouchersCheckout,
  syncPaidInvoices,
} from "@cocalc/frontend/purchases/api";
import { StoreBalanceContext } from "../../lib/balance";
import { ADD_STYLE } from "./add-box";
// import { DisplayCost } from "./site-license-cost";

const STYLE = { color: "#666", fontSize: "12pt" } as const;

interface Config {
  whenPay: WhenPay;
  numVouchers: number;
  amount: number;
  length: number;
  title: string;
  prefix: string;
  postfix: string;
  charset: CharSet;
  expire: dayjs.Dayjs;
}

export default function CreateVouchers() {
  const router = useRouter();
  const isMounted = useIsMounted();
  const { profile, reload: reloadProfile } = useProfileWithReload({
    noCache: true,
  });
  const { refreshBalance } = useContext(StoreBalanceContext);
  const [error, setError] = useState<string>("");

  // user configurable options: start
  const [query, setQuery0] = useState<Config>(() => {
    const q = router.query;
    return {
      whenPay: typeof q.whenPay == "string" ? (q.whenPay as WhenPay) : "now",
      numVouchers:
        typeof q.numVouchers == "string" ? parseInt(q.numVouchers) : 1,
      amount: typeof q.amount == "string" ? parseInt(q.amount) : 5,
      length: typeof q.length == "string" ? parseInt(q.length) : 8,
      title: typeof q.title == "string" ? q.title : "My Voucher",
      prefix: typeof q.prefix == "string" ? q.prefix : "",
      postfix: typeof q.postfix == "string" ? q.postfix : "",
      charset: typeof q.charset == "string" ? q.charset : "alphanumeric",
      expire:
        typeof q.expire == "string" ? dayjs(q.expire) : dayjs().add(30, "day"),
    };
  });
  const {
    whenPay,
    numVouchers,
    amount,
    length,
    title,
    prefix,
    postfix,
    charset,
    expire,
  } = query;
  const setQuery = (obj) => {
    const query1 = { ...query };
    for (const key in obj) {
      const value = obj[key];
      router.query[key] =
        key == "expire" ? value.toDate().toISOString() : `${value}`;
      query1[key] = value;
    }
    router.replace({ query: router.query }, undefined, {
      shallow: true,
      scroll: false,
    });
    setQuery0(query1);
  };

  //////
  // Handling payment -- start
  // This is very similar to checkout.tsx, but I couldn't think of a good way to
  // avoid dup, and vouchers are *barely* used.
  const [completingPurchase, setCompletingPurchase] = useState<boolean>(false);

  useEffect(() => {
    if (router.query.complete == null) {
      // nothing to handle
      return;
    }

    (async () => {
      // in case webhooks aren't configured, get the payment via sync:
      try {
        await syncPaidInvoices();
      } catch (err) {
        console.warn("syncPaidInvoices buying vouchers -- issue", err);
      }
      // now do the purchase flow again with money available.
      completePurchase();
    })();
  }, []);

  async function completePurchase() {
    try {
      setError("");
      setCompletingPurchase(true);
      if (!isMounted.current) {
        return;
      }
      await vouchersCheckout({
        config: {
          count: numVouchers ?? 1,
          expire: expire.toDate(),
          cancelBy: dayjs().add(14, "day").toDate(),
          active: dayjs().toDate(),
          title,
          whenPay,
          generate: {
            length,
            charset,
            prefix,
            postfix,
          },
        },
      });
      if (isMounted.current) {
        router.push("/store/congrats");
      }
    } catch (err) {
      // The purchase failed.
      setError(err.message);
    } finally {
      await refreshBalance();
      if (!isMounted.current) return;
    }
  }
  // Handling payment -- end
  //////

  const exampleCodes: string = useMemo(() => {
    return vouchers({ count: 5, length, charset, prefix, postfix }).join(", ");
  }, [length, charset, prefix, postfix]);

  // most likely, user will do the purchase and then see the congratulations page
  useEffect(() => {
    router.prefetch("/store/congrats");
  }, []);

  useEffect(() => {
    if ((numVouchers ?? 0) > MAX_VOUCHERS[whenPay]) {
      setQuery({ numVouchers: MAX_VOUCHERS[whenPay] });
    }
  }, [whenPay]);

  const disabled =
    !numVouchers ||
    completingPurchase ||
    !title?.trim() ||
    expire == null ||
    !profile?.email_address;

  function renderHeading() {
    return (
      <div>
        <Title level={3}>
          <Icon name={"gift2"} style={{ marginRight: "5px" }} />{" "}
          {router.query.id != null
            ? "Edit Voucher in Shopping Cart"
            : "Configure a Voucher"}
        </Title>
        <Paragraph style={STYLE}>
          Voucher codes can be <A href="/redeem">redeemed</A> for <SiteName />{" "}
          credit, which does not expire and can be used to purchase anything on
          the site (licenses, GPU's, etc.). Visit the{" "}
          <A href="/vouchers">Voucher Center</A> for more about vouchers, and{" "}
          <A href="https://doc.cocalc.com/vouchers.html">read the docs</A>.
        </Paragraph>
      </div>
    );
  }

  function renderVoucherConfig() {
    return (
      <>
        <div>
          {profile?.is_admin && (
            <>
              <h4 style={{ fontSize: "13pt", marginTop: "20px" }}>
                <Check done /> Admin: Pay or Free
              </h4>
              <div>
                <Radio.Group
                  value={whenPay}
                  onChange={(e) => {
                    setQuery({ whenPay: e.target.value as WhenPay });
                  }}
                >
                  <Space
                    direction="vertical"
                    style={{ margin: "5px 0 15px 15px" }}
                  >
                    <Radio value={"now"}>Pay Now</Radio>
                    {profile?.is_admin && (
                      <Radio value={"admin"}>
                        Admin Vouchers: you will not be charged (admins only)
                      </Radio>
                    )}
                  </Space>
                </Radio.Group>
                <br />
                <Paragraph style={STYLE}>
                  {profile?.is_admin && (
                    <>
                      As an admin, you may select the "Admin" option; this is
                      useful for creating free trials, fulfilling complicated
                      customer requirements and adding credit to your own
                      account.
                    </>
                  )}
                </Paragraph>
              </div>
            </>
          )}
          <h4 style={{ fontSize: "13pt", marginTop: "20px" }}>
            <Check done={(numVouchers ?? 0) > 0} /> Value of Each Voucher
          </h4>
          <Paragraph style={STYLE}>
            Input the value of each voucher:
            <div style={{ textAlign: "center", marginTop: "15px" }}>
              <InputNumber
                size="large"
                min={5}
                max={MAX_VOUCHER_VALUE}
                precision={2} // for two decimal places
                step={5}
                value={amount}
                onChange={(value) => setQuery({ amount: value })}
                addonAfter="$"
              />
            </div>
          </Paragraph>
          <h4 style={{ fontSize: "13pt", marginTop: "20px" }}>
            <Check done={(numVouchers ?? 0) > 0} /> Number of Voucher Codes
          </h4>
          <Paragraph style={STYLE}>
            Input the number of voucher codes to{" "}
            {whenPay == "now" ? "buy" : "create"} (limit:{" "}
            {MAX_VOUCHERS[whenPay]}):
            <div style={{ textAlign: "center", marginTop: "15px" }}>
              <InputNumber
                size="large"
                style={{ width: "250px" }}
                min={1}
                max={MAX_VOUCHERS[whenPay]}
                value={numVouchers}
                onChange={(value) => setQuery({ numVouchers: value })}
                addonAfter={`Voucher ${plural(numVouchers, "Code")}`}
              />
            </div>
          </Paragraph>
          {whenPay == "admin" && (
            <>
              <h4 style={{ fontSize: "13pt", marginTop: "20px" }}>
                <Check done={expire != null} />
                When Voucher Codes Expire
              </h4>
              <Paragraph style={STYLE}>
                As an admin you can set any expiration date you want for the
                voucher codes.
              </Paragraph>
              <Form
                labelCol={{ span: 9 }}
                wrapperCol={{ span: 9 }}
                layout="horizontal"
              >
                <Form.Item label="Expire">
                  <DatePicker
                    value={expire}
                    presets={[
                      {
                        label: "+ 7 Days",
                        value: dayjs().add(7, "d"),
                      },
                      {
                        label: "+ 30 Days",
                        value: dayjs().add(30, "day"),
                      },
                      {
                        label: "+ 2 months",
                        value: dayjs().add(2, "months"),
                      },
                      {
                        label: "+ 6 months",
                        value: dayjs().add(6, "months"),
                      },
                      {
                        label: "+ 1 Year",
                        value: dayjs().add(1, "year"),
                      },
                    ]}
                    onChange={(expire) => setQuery({ expire })}
                    disabledDate={(current) => {
                      if (!current) {
                        return true;
                      }
                      // Can not select days before today and today
                      if (current < dayjs().endOf("day")) {
                        return true;
                      }
                      // ok
                      return false;
                    }}
                  />
                </Form.Item>
              </Form>
            </>
          )}
          <h4
            style={{
              fontSize: "13pt",
              marginTop: "20px",
              color: !title ? "darkred" : undefined,
            }}
          >
            <Check done={!!title.trim()} /> Description
          </h4>
          <Paragraph style={STYLE}>
            <div
              style={
                !title
                  ? { borderRight: "5px solid darkred", paddingRight: "15px" }
                  : undefined
              }
            >
              <div
                style={
                  !title ? { fontWeight: 700, color: "darkred" } : undefined
                }
              >
                Describe this voucher:
              </div>
              <Input
                allowClear
                style={{ marginBottom: "15px", marginTop: "5px" }}
                onChange={(e) => setQuery({ title: e.target.value })}
                value={title}
                addonBefore={"Description"}
              />
            </div>
            Customize how your voucher codes are randomly generated (optional):
            <Space direction="vertical" style={{ marginTop: "5px" }}>
              <Space>
                <InputNumber
                  addonBefore={"Length"}
                  min={8}
                  max={16}
                  onChange={(length) => {
                    setQuery({ length: length ?? 8 });
                  }}
                  value={length}
                />
                <Input
                  maxLength={10 /* also enforced via api */}
                  onChange={(e) => setQuery({ prefix: e.target.value })}
                  value={prefix}
                  addonBefore={"Prefix"}
                  allowClear
                />
                <Input
                  maxLength={10 /* also enforced via api */}
                  onChange={(e) => setQuery({ postfix: e.target.value })}
                  value={postfix}
                  addonBefore={"Postfix"}
                  allowClear
                />{" "}
              </Space>
              <Space>
                <Radio.Group
                  onChange={(e) => {
                    setQuery({ charset: e.target.value });
                  }}
                  defaultValue={charset}
                >
                  <Radio.Button value="alphanumeric">alphanumeric</Radio.Button>
                  <Radio.Button value="alphabetic">alphabetic</Radio.Button>
                  <Radio.Button value="numbers">0123456789</Radio.Button>
                  <Radio.Button value="lower">lower</Radio.Button>
                  <Radio.Button value="upper">UPPER</Radio.Button>
                </Radio.Group>
              </Space>
              <Space>
                <div style={{ whiteSpace: "nowrap" }}>Examples:</div>{" "}
                {exampleCodes}
              </Space>
            </Space>
          </Paragraph>
        </div>
      </>
    );
  }

  function renderAddBox() {
    return (
      <div style={{ textAlign: "center" }}>
        <div style={ADD_STYLE}>
          <Space>
            <Button>Cancel</Button>
            <Button disabled={disabled} type="primary">
              Add to Cart
            </Button>
          </Space>
        </div>
      </div>
    );
  }

  return (
    <>
      {renderHeading()}
      <RequireEmailAddress profile={profile} reloadProfile={reloadProfile} />
      <ShowError error={error} setError={setError} />
      {renderAddBox()}
      {renderVoucherConfig()}
      {renderAddBox()}
    </>
  );
}

const CHECK_STYLE = { marginRight: "5px", fontSize: "14pt" };
function Check({ done }) {
  if (done) {
    return <Icon name="check" style={{ ...CHECK_STYLE, color: "green" }} />;
  } else {
    return (
      <Icon name="arrow-right" style={{ ...CHECK_STYLE, color: "#cf1322" }} />
    );
  }
}
