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
import PaymentMethods from "components/billing/payment-methods";
import A from "components/misc/A";
import Loading from "components/share/loading";
import SiteName from "components/share/site-name";
// import apiPost from "lib/api/post";
import useAPI from "lib/hooks/api";
import useIsMounted from "lib/hooks/mounted";
import { useRouter } from "next/router";
import { computeCost } from "./compute-cost";
import { useProfileWithReload } from "lib/hooks/profile";
import { Paragraph } from "components/misc";
import {
  fullCost,
  getColumns,
  OrderError,
  RequireEmailAddress,
} from "./checkout";
import { COLORS } from "@cocalc/util/theme";
import vouchers, { CharSet } from "@cocalc/util/vouchers";

const MAX_AMOUNT = 10000;

export default function CreateVouchers() {
  const router = useRouter();
  const isMounted = useIsMounted();
  const { profile, reload: reloadProfile } = useProfileWithReload({
    noCache: true,
  });
  const [placingOrder, setCreatingVouchers] = useState<boolean>(false);
  const [haveCreditCard, setHaveCreditCard] = useState<boolean>(false);
  const [orderError, setOrderError] = useState<string>("");
  const [subTotal, setSubTotal] = useState<number>(0);
  const [taxRate, setTaxRate] = useState<number>(0);
  const [numVouchers, setNumVouchers] = useState<number>(0);
  const [length, setLength] = useState<number>(8);
  const [title, setTitle] = useState<string>("");
  const [prefix, setPrefix] = useState<string>("");
  const [postfix, setPostfix] = useState<string>("");
  const [charset, setCharset] = useState<CharSet>("alphanumeric");
  const [expire, setExpire] = useState<dayjs.Dayjs | null>(
    dayjs().add(30, "day")
  );
  const exampleCodes: string = useMemo(() => {
    return vouchers({ count: 5, length, charset, prefix, postfix }).join(", ");
  }, [length, charset, prefix, postfix]);

  // most likely, user will do the purchase and then see the congratulations page
  useEffect(() => {
    router.prefetch("/store/congrats");
  }, []);

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

  if (cart0.error) {
    return <Alert type="error" message={cart.error} />;
  }
  if (!items) {
    return <Loading center />;
  }

  async function createVouchers() {
    try {
      setOrderError("");
      setCreatingVouchers(true);
      // Success!
      if (!isMounted.current) return;
      router.push("/store/congrats");
    } catch (err) {
      // The purchase failed.
      setOrderError(err.message);
    } finally {
      if (!isMounted.current) return;
      setCreatingVouchers(false);
    }
  }

  const columns = getColumns({ noDiscount: true, voucherPeriod: true });

  function CreateVouchersButton() {
    const v = plural(numVouchers, "Voucher");
    return (
      <Button
        disabled={
          !numVouchers ||
          !title?.trim() ||
          expire == null ||
          subTotal == 0 ||
          placingOrder ||
          !haveCreditCard ||
          !profile?.email_address
        }
        style={{ marginTop: "7px", marginBottom: "15px" }}
        size="large"
        type="primary"
        onClick={createVouchers}
      >
        {placingOrder ? (
          <Loading delay={0}>
            Creating {numVouchers} {v}...
          </Loading>
        ) : (
          <>
            Create {numVouchers} {v}
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
        <br />
        <br />
        You must have at least one non-subscription item in{" "}
        <A href="/store/cart">your cart</A> to create vouchers. Shop for{" "}
        <A href="/store/site-license">upgrades</A>, a{" "}
        <A href="/store/boost">license boost</A>, or a{" "}
        <A href="/dedicated">dedicated VM or disk</A>, and select a specific
        range of dates. When the voucher is redeemed it starts at the redemption
        date, and lasts for the same number of days as your shopping cart item.
      </div>
    );
  }

  // this can't just be a component, since it depends on a bunch of scope,
  function nonemptyCart(items) {
    return (
      <>
        <OrderError orderError={orderError} />
        <Row>
          <Col md={14} sm={24}>
            <div>
              <h3 style={{ fontSize: "16pt" }}>
                <Icon name={"credit-card"} style={{ marginRight: "5px" }} />
                Create Vouchers
              </h3>
              As a member of the CoCalc partner program, you are allowed to
              create vouchers. These are codes that you can provide to other
              people, who can then redeem them (exactly once) for the{" "}
              {items.length} {plural(items.length, "license")} listed in Section
              3 below.
              <h4 style={{ fontSize: "13pt", marginTop: "20px" }}>
                1. How Many Vouchers? <Check done={numVouchers > 0} />
              </h4>
              <Paragraph style={{ color: "#666" }}>
                Input the number of vouchers you would like to create.
                <div style={{ textAlign: "center", marginTop: "15px" }}>
                  <InputNumber
                    size="large"
                    min={0}
                    max={Math.ceil(MAX_AMOUNT / (subTotal ?? 1))}
                    onChange={(value) => setNumVouchers(value ?? 1)}
                  />
                </div>
              </Paragraph>
              <h4 style={{ fontSize: "13pt", marginTop: "20px" }}>
                2. When do the Vouchers Expire? <Check done={expire != null} />
              </h4>
              <Paragraph style={{ color: "#666" }}>
                Any voucher that is not redeemed by the given date will expire.
                You can choose a date that is up to 60 days in the future. You
                will be invoiced only for vouchers that are redeemed before the
                expiration date.
                <div style={{ textAlign: "center", marginTop: "15px" }}>
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
                        label: "+ 45 Days",
                        value: dayjs().add(45, "day"),
                      },
                      {
                        label: "+ 60 Days",
                        value: dayjs().add(60, "day"),
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
                      // Cannot select days more than 60 days in the future.
                      if (current > dayjs().endOf("day").add(60, "day")) {
                        return true;
                      }
                      // ok
                      return false;
                    }}
                  />
                </div>
              </Paragraph>{" "}
              <h4 style={{ fontSize: "13pt", marginTop: "20px" }}>
                3. Customize <Check done={!!title.trim()} />
              </h4>
              <Paragraph style={{ color: "#666" }}>
                Describe this group of vouchers so you can easily find them
                later in your voucher list.
                <Input
                  style={{ marginBottom: "15px", marginTop: "5px" }}
                  onChange={(e) => setTitle(e.target.value)}
                  value={title}
                  addonBefore={"Description"}
                />
                Customize how your voucher codes are randomly generated
                (optional):
                <Space direction="vertical" style={{ marginTop: "5px" }}>
                  <Space>
                    <InputNumber
                      addonBefore={"Length"}
                      min={6}
                      max={16}
                      onChange={(length) => setLength(length ?? 8)}
                      value={length}
                    />
                    <Input
                      onChange={(e) => setPrefix(e.target.value)}
                      value={prefix}
                      addonBefore={"Prefix"}
                      allowClear
                    />
                    <Input
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
                      <Radio.Button value="alphanumeric">
                        alphanumeric
                      </Radio.Button>
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
              <h4 style={{ fontSize: "13pt", marginTop: "20px" }}>
                4. Ensure a Payment Method is on File{" "}
                <Check done={haveCreditCard} />
              </h4>
              <Paragraph style={{ color: "#666" }}>
                The default payment method shown below will be used to pay for
                the redeemed vouchers, unless you change the payment method
                before you are invoiced.
              </Paragraph>
              <PaymentMethods
                startMinimized
                setTaxRate={setTaxRate}
                setHaveCreditCard={setHaveCreditCard}
              />
            </div>
          </Col>
          <Col md={{ offset: 1, span: 9 }} sm={{ span: 24, offset: 0 }}>
            <div>
              <div
                style={{
                  textAlign: "center",
                  border: "1px solid #ddd",
                  padding: "15px",
                  borderRadius: "5px",
                  minWidth: "300px",
                }}
              >
                <CreateVouchersButton />
                <Terms />
                <VoucherSummary
                  items={items}
                  taxRate={taxRate}
                  numVouchers={numVouchers}
                />
                <span style={{ fontSize: "13pt" }}>
                  <TotalCost
                    items={items}
                    taxRate={taxRate}
                    numVouchers={numVouchers}
                  />
                </span>
              </div>
            </div>
          </Col>
        </Row>

        <h4 style={{ fontSize: "13pt", marginTop: "15px" }}>
          5.{" "}
          {numVouchers == 1
            ? "Your Voucher"
            : `Each of Your ${numVouchers} Vouchers`}{" "}
          Provides the Following {items.length}{" "}
          {plural(items.length, "License")}
        </h4>
        <Paragraph style={{ color: "#666" }}>
          These are the licenses with a fixed range of time from your shopping
          cart (vouchers cannot be used to create subscriptions). When used, the
          voucher is redeemed for one or more license starting at the time of
          redemption and running for the same length of time as each license
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
          6. Create Your {plural(numVouchers, "Voucher")}
        </h4>
        <div style={{ fontSize: "12pt" }}>
          <Row>
            <Col sm={12}>
              <CreateVouchersButton />
            </Col>
            <Col sm={12}>
              <div style={{ fontSize: "15pt" }}>
                <TotalCost
                  items={cart}
                  taxRate={taxRate}
                  numVouchers={numVouchers}
                />
                <br />
                <Terms />
              </div>
            </Col>
          </Row>
        </div>
      </>
    );
  }

  return (
    <>
      <RequireEmailAddress profile={profile} reloadProfile={reloadProfile} />
      {items.length == 0 && <EmptyCart />}
      {items.length > 0 && nonemptyCart(items)}
      <OrderError orderError={orderError} />
    </>
  );
}

function TotalCost({ items, taxRate, numVouchers }) {
  const cost = numVouchers * fullCost(items) * (1 + taxRate);
  return (
    <>
      Maximum Amount:{" "}
      <b style={{ float: "right", color: "darkred" }}>{money(cost)}</b>
    </>
  );
}

function Terms() {
  return (
    <Paragraph style={{ color: COLORS.GRAY, fontSize: "10pt" }}>
      By creating vouchers, you agree to{" "}
      <A href="/policies/terms" external>
        our terms of service,
      </A>{" "}
      and agree to pay for any vouchers that are redeemed, up to the maxium
      amount listed here.
    </Paragraph>
  );
}

function VoucherSummary({ items, taxRate, numVouchers }) {
  const full = numVouchers * fullCost(items);
  const tax = full * taxRate;
  return (
    <Paragraph style={{ textAlign: "left" }}>
      <b style={{ fontSize: "14pt" }}>Summary</b>
      <Paragraph style={{ color: "#666" }}>
        You will be invoiced for up to {money(full + tax, true)}, depending on
        how many vouchers are redeeemed. If no vouchers are redeemed you will
        not pay anything.
      </Paragraph>
      <div>
        {numVouchers} Vouchers (each for {items.length}{" "}
        {plural(items.length, "license")}):{" "}
        <span style={{ float: "right" }}>{money(full, true)}</span>
      </div>
      <div>
        Estimated tax:{" "}
        <span style={{ float: "right" }}>{money(tax, true)}</span>
      </div>
    </Paragraph>
  );
}

const CHECK_STYLE = { marginLeft: "15px", fontSize: "16pt" };
function Check({ done }) {
  if (done) {
    return (
      <Icon name="check-square" style={{ ...CHECK_STYLE, color: "green" }} />
    );
  } else {
    return <Icon name="box" style={{ ...CHECK_STYLE, color: "#cf1322" }} />;
  }
}
