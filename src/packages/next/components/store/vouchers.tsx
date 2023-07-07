/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
Voucher -- create vouchers from the contents of your shopping cart.
*/

import {
  Alert,
  Button,
  Col,
  DatePicker,
  Divider,
  Form,
  Input,
  InputNumber,
  Radio,
  Row,
  Table,
  Space,
} from "antd";
import dayjs from "dayjs";
import { useEffect, useMemo, useState } from "react";
import { Icon } from "@cocalc/frontend/components/icon";
import { money } from "@cocalc/util/licenses/purchase/utils";
import { plural } from "@cocalc/util/misc";
import A from "components/misc/A";
import Loading from "components/share/loading";
import SiteName from "components/share/site-name";
import useAPI from "lib/hooks/api";
import useIsMounted from "lib/hooks/mounted";
import { useRouter } from "next/router";
import { computeCost } from "@cocalc/util/licenses/store/compute-cost";
import { useProfileWithReload } from "lib/hooks/profile";
import { Paragraph } from "components/misc";
import {
  fullCost,
  discountedCost,
  getColumns,
  ShowError as OrderError,
  RequireEmailAddress,
} from "./checkout";
import { COLORS } from "@cocalc/util/theme";
import vouchers, {
  CharSet,
  MAX_VOUCHERS,
  WhenPay,
} from "@cocalc/util/vouchers";
import {
  getCurrentCheckoutSession,
  cancelCurrentCheckoutSession,
  getVoucherCartCheckoutParams,
  vouchersCheckout,
} from "@cocalc/frontend/purchases/api";
import type { CheckoutParams } from "@cocalc/server/purchases/shopping-cart-checkout";
import { ExplainPaymentSituation } from "./checkout";

export default function CreateVouchers() {
  const router = useRouter();
  const isMounted = useIsMounted();
  const { profile, reload: reloadProfile } = useProfileWithReload({
    noCache: true,
  });
  const [whenPay, setWhenPay] = useState<WhenPay>("now");
  const [orderError, setOrderError] = useState<string>("");
  const [subTotal, setSubTotal] = useState<number>(0);
  const [numVouchers, setNumVouchers] = useState<number | null>(1);
  const [length, setLength] = useState<number>(8);
  const [title, setTitle] = useState<string>("");
  const [prefix, setPrefix] = useState<string>("");
  const [postfix, setPostfix] = useState<string>("");
  const [charset, setCharset] = useState<CharSet>("alphanumeric");
  const [expire, setExpire] = useState<dayjs.Dayjs | null>(
    dayjs().add(30, "day")
  );

  const [params, setParams] = useState<CheckoutParams | null>(null);
  const updateParams = async (count, whenPay) => {
    if (whenPay == "admin" || count == null) {
      setParams(null);
      return;
    }
    try {
      setParams(await getVoucherCartCheckoutParams(count));
    } catch (err) {
      setOrderError(`${err}`);
    }
  };
  useEffect(() => {
    updateParams(numVouchers, whenPay);
  }, [subTotal, numVouchers, whenPay]);

  //////
  // Handling payment -- start
  // This is very similar to checkout.tsx, but I couldn't think of a good way to
  // avoid dup, and vouchers are *barely* used.
  const [completingPurchase, setCompletingPurchase] = useState<boolean>(false);
  const [session, setSession] = useState<{ id: string; url: string } | null>(
    null
  );
  const updateSession = async () => {
    const session = await getCurrentCheckoutSession();
    setSession(session);
    return session;
  };
  useEffect(() => {
    // on load, check for existing payent session.
    updateSession();
  }, []);
  useEffect(() => {
    if (router.query.complete == null) {
      // nothing to handle
      return;
    }
    completePurchase();
  }, []);
  async function completePurchase() {
    try {
      setOrderError("");
      setCompletingPurchase(true);
      const curSession = await updateSession();
      if (curSession != null || !isMounted.current) {
        // there is already a stripe checkout session that hasn't been finished, so let's
        // not cause confusion by creating another one.
        // User will see a big alert with a link to finish this one, since updateSession
        // sets the session state.
        return;
      }
      // This api call tells the backend, "make a session that, when successfully finished, results in
      // buying everything in my shopping cart", or, if it returns {done:true}, then
      // It succeeds if the purchase goes through.
      const currentUrl = window.location.href.split("?")[0];
      const success_url = `${currentUrl}?complete=true`;
      // This api call: "create requested vouchers from everything in my
      // shopping cart that is not a subscription" if possible; otherwise, give me a stripe
      // checkout session for the right amount.
      const result = await vouchersCheckout({
        success_url,
        cancel_url: currentUrl,
        config: {
          count: numVouchers ?? 1,
          expire,
          cancelBy: dayjs().add(14, "day"),
          active: dayjs(),
          title,
          length,
          charset,
          prefix,
          postfix,
          whenPay,
        },
      });
      if (result.done) {
        // done -- nothing further to do!
        if (isMounted.current) {
          router.push("/store/congrats");
        }
        return;
      }
      // payment is required to complete the purchase, since user doesn't
      // have enough credit.
      window.location = result.session.url as any;
    } catch (err) {
      // The purchase failed.
      setOrderError(err.message);
    } finally {
      if (!isMounted.current) return;
      setCompletingPurchase(false);
    }
  }
  const cancelPurchaseInProgress = async () => {
    try {
      await cancelCurrentCheckoutSession();
      updateSession();
    } catch (err) {
      setOrderError(err.message);
    }
  };
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
      setNumVouchers(MAX_VOUCHERS[whenPay]);
    }
  }, [whenPay]);

  const cart0 = useAPI("/shopping/cart/get");

  const cart = useMemo(() => {
    return cart0.result?.filter((item) => item.description?.period == "range");
  }, [cart0.result]);

  const items = useMemo(() => {
    if (!cart) return undefined;
    const x: any[] = [];
    let subTotal = 0;
    for (const item of cart) {
      if (!item.checked) continue;
      item.cost = computeCost(item.description);
      subTotal += item.cost.cost;
      x.push(item);
    }
    setSubTotal(subTotal);
    return x;
  }, [cart]);

  if (session?.url != null) {
    return (
      <div style={{ textAlign: "center" }}>
        <Alert
          style={{ margin: "30px", display: "inline-block" }}
          type="warning"
          message={<h2>Purchase in Progress</h2>}
          description={
            <div style={{ fontSize: "14pt", width: "450px" }}>
              <Divider />
              <p>
                <Button href={session.url} type="primary" size="large">
                  Complete Purchase
                </Button>
              </p>
              or
              <p style={{ marginTop: "15px" }}>
                <Button onClick={cancelPurchaseInProgress}>Cancel</Button>
              </p>
            </div>
          }
        />
      </div>
    );
  }

  if (cart0.error) {
    return <Alert type="error" message={cart.error} />;
  }
  if (!items) {
    return <Loading center />;
  }

  const columns = getColumns({
    noDiscount: whenPay != "now",
    voucherPeriod: true,
  });

  const disabled =
    (params != null && params?.chargeAmount > 0) ||
    !numVouchers ||
    completingPurchase ||
    !title?.trim() ||
    expire == null ||
    subTotal == 0 ||
    !profile?.email_address;

  function CreateVouchersButton() {
    const v = plural(numVouchers ?? 0, "Voucher Code");
    return (
      <Button
        disabled={disabled}
        style={{ marginTop: "7px", marginBottom: "15px" }}
        size="large"
        type="primary"
        onClick={completePurchase}
      >
        {completingPurchase ? (
          <Loading delay={0}>
            Creating {numVouchers ?? 0} {v}...
          </Loading>
        ) : (
          <>
            Create {numVouchers ?? 0} {v}
            {whenPay == "now"}
            {whenPay == "admin" && " (no charge)"}
          </>
        )}
      </Button>
    );
  }

  function EmptyCart() {
    return (
      <div style={{ maxWidth: "800px", margin: "auto" }}>
        <h3>
          <Icon name={"shopping-cart"} style={{ marginRight: "5px" }} />
          {cart?.length > 0 && (
            <>
              Nothing in Your <SiteName />{" "}
              <A href="/store/cart">Shopping Cart</A> is Selected
            </>
          )}
          {(cart0.result?.length ?? 0) == 0 ? (
            <>
              Your <SiteName /> <A href="/store/cart">Shopping Cart</A> is Empty
            </>
          ) : (
            <>
              Your <SiteName /> <A href="/store/cart">Shopping Cart</A> must
              contain at least one non-subscription item
            </>
          )}
        </h3>
        You must have at least one non-subscription item in{" "}
        <A href="/store/cart">your cart</A> to create vouchers. Shop for{" "}
        <A href="/store/site-license">upgrades</A>, a{" "}
        <A href="/store/boost">license boost</A>, or a{" "}
        <A href="/dedicated">dedicated VM or disk</A>, and select a specific
        range of dates. When you <A href="/redeem">redeem a voucher</A>, the
        corresponding licenses start at the redemption date, and last for the
        same number of days as your shopping cart item. You can also browse all{" "}
        <A href="/vouchers/redeemed">vouchers you have redeeemed</A>.
      </div>
    );
  }

  // this can't just be a component, since it depends on a bunch of scope,
  function nonemptyCart(items) {
    return (
      <>
        <OrderError error={orderError} />
        <div>
          <h3 style={{ fontSize: "16pt" }}>
            <Icon name={"gift2"} style={{ marginRight: "10px" }} />
            Create Voucher Codes
          </h3>
          <Paragraph style={{ color: "#666" }}>
            Voucher codes can be <A href="/redeem">redeemed</A> for the{" "}
            {items.length} {plural(items.length, "license")} listed below. The
            license start and end dates are shifted to match when the license is
            redeemed. Visit the <A href="/vouchers">Voucher Center</A> for more
            about vouchers, and{" "}
            <A href="https://doc.cocalc.com/vouchers.html">read the docs</A>.
          </Paragraph>
          {profile?.is_admin && (
            <>
              <h4 style={{ fontSize: "13pt", marginTop: "20px" }}>
                <Check done /> Pay Now
              </h4>
              <div>
                <Radio.Group
                  value={whenPay}
                  onChange={(e) => {
                    setWhenPay(e.target.value as WhenPay);
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
                <Paragraph style={{ color: "#666" }}>
                  {profile?.is_admin && (
                    <>
                      As an admin, you may select the "Admin" option; this is
                      useful for creating free trials or fulfilling complicated
                      customer requirements.{" "}
                    </>
                  )}
                </Paragraph>
              </div>
            </>
          )}
          <h4 style={{ fontSize: "13pt", marginTop: "20px" }}>
            <Check done={(numVouchers ?? 0) > 0} /> How Many Voucher Codes?
          </h4>
          <Paragraph style={{ color: "#666" }}>
            Input the number of voucher codes you would like to{" "}
            {whenPay == "now" ? "buy" : "create"} (limit:{" "}
            {MAX_VOUCHERS[whenPay]}).
            <div style={{ textAlign: "center", marginTop: "15px" }}>
              <InputNumber
                size="large"
                min={1}
                max={MAX_VOUCHERS[whenPay]}
                value={numVouchers}
                onChange={(value) => setNumVouchers(value)}
              />
            </div>
          </Paragraph>
          {whenPay == "admin" && (
            <>
              <h4 style={{ fontSize: "13pt", marginTop: "20px" }}>
                <Check done={expire != null} />
                When Voucher Codes Expire
              </h4>
              <Paragraph style={{ color: "#666" }}>
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
                    onChange={setExpire}
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
          <h4 style={{ fontSize: "13pt", marginTop: "20px" }}>
            <Check done={!!title.trim()} /> Customize
          </h4>
          <Paragraph style={{ color: "#666" }}>
            Describe this voucher so you can easily find it later.
            <Input
              style={{ marginBottom: "15px", marginTop: "5px" }}
              onChange={(e) => setTitle(e.target.value)}
              value={title}
              addonBefore={"Description"}
            />
            Customize how your voucher codes are randomly generated (optional):
            <Space direction="vertical" style={{ marginTop: "5px" }}>
              <Space>
                <InputNumber
                  addonBefore={"Length"}
                  min={8}
                  max={16}
                  onChange={(length) => setLength(length ?? 8)}
                  value={length}
                />
                <Input
                  maxLength={10 /* also enforced via api */}
                  onChange={(e) => setPrefix(e.target.value)}
                  value={prefix}
                  addonBefore={"Prefix"}
                  allowClear
                />
                <Input
                  maxLength={10 /* also enforced via api */}
                  onChange={(e) => setPostfix(e.target.value)}
                  value={postfix}
                  addonBefore={"Postfix"}
                  allowClear
                />{" "}
              </Space>
              <Space>
                <Radio.Group
                  onChange={(e) => {
                    setCharset(e.target.value);
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

        <h4 style={{ fontSize: "13pt", marginTop: "15px" }}>
          <Check done />
          {(numVouchers ?? 0) == 1
            ? "Your Voucher"
            : `Each of Your ${numVouchers ?? 0} Voucher Codes`}{" "}
          Provides the Following {items.length}{" "}
          {plural(items.length, "License")}
        </h4>
        <Paragraph style={{ color: "#666" }}>
          These are the licenses with a fixed range of time from your shopping
          cart (vouchers cannot be used to create subscriptions). When used, the
          voucher code is redeemed for one or more license starting at the time
          of redemption and running for the same length of time as each license
          listed below.
        </Paragraph>
        <div style={{ border: "1px solid #eee" }}>
          <Table
            showHeader={false}
            columns={columns}
            dataSource={items}
            rowKey={"id"}
            pagination={{ hideOnSinglePage: true }}
          />
        </div>
        <h4 style={{ fontSize: "13pt", marginTop: "30px" }}>
          <Check done={!disabled} /> Create Your{" "}
          {plural(numVouchers ?? 0, "Voucher Code")}
        </h4>
        {numVouchers != null && (
          <div style={{ fontSize: "12pt" }}>
            {params != null && (
              <ExplainPaymentSituation
                params={params}
                style={{ margin: "15px 0" }}
              />
            )}
            <Row>
              <Col sm={12}>
                <CreateVouchersButton />
              </Col>
              <Col sm={12}>
                <div style={{ fontSize: "15pt" }}>
                  <TotalCost
                    items={cart}
                    numVouchers={numVouchers ?? 0}
                    whenPay={whenPay}
                  />
                  <br />
                  <Terms whenPay={whenPay} />
                </div>
              </Col>
            </Row>
          </div>
        )}
      </>
    );
  }

  return (
    <>
      <RequireEmailAddress profile={profile} reloadProfile={reloadProfile} />
      {items.length == 0 && <EmptyCart />}
      {items.length > 0 && nonemptyCart(items)}
      <OrderError error={orderError} />
    </>
  );
}

function TotalCost({ items, numVouchers, whenPay }) {
  const cost =
    numVouchers * (whenPay == "now" ? discountedCost(items) : fullCost(items));
  return (
    <>
      {whenPay == "now" ? "Total Amount" : "Maximum Amount"}:{" "}
      <b style={{ float: "right", color: "darkred" }}>{money(cost)}</b>
    </>
  );
}

function Terms({ whenPay }) {
  return (
    <Paragraph style={{ color: COLORS.GRAY, fontSize: "10pt" }}>
      By creating vouchers, you agree to{" "}
      <A href="/policies/terms" external>
        our terms of service,
      </A>{" "}
      {whenPay == "now" && (
        <>and agree to pay for the voucher you have requested.</>
      )}
      {whenPay == "invoice" && (
        <>
          and agree to pay for any voucher codes that are redeemed, up to the
          maxium amount listed here.
        </>
      )}
      {whenPay == "admin" && (
        <>
          and as an admin agree to use the voucher for company purposes. The
          cash value is listed above.
        </>
      )}
    </Paragraph>
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
