/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
Voucher -- create vouchers from the contents of your shopping cart.
*/

import { Alert, Button, Col, Row, Table } from "antd";
import { useEffect, useMemo, useState } from "react";
import { Icon } from "@cocalc/frontend/components/icon";
import { money } from "@cocalc/util/licenses/purchase/utils";
import { copy_without as copyWithout, isValidUUID } from "@cocalc/util/misc";
import PaymentMethods from "components/billing/payment-methods";
import A from "components/misc/A";
import Loading from "components/share/loading";
import SiteName from "components/share/site-name";
// import apiPost from "lib/api/post";
import useAPI from "lib/hooks/api";
import useIsMounted from "lib/hooks/mounted";
import { useRouter } from "next/router";
import { computeCost } from "./compute-cost";
import { describeItem, DisplayCost } from "./site-license-cost";
import { useProfileWithReload } from "lib/hooks/profile";
import { Paragraph, Title, Text } from "components/misc";
import { COLORS } from "@cocalc/util/theme";
import { ChangeEmailAddress } from "components/account/config/account/email";

export default function Voucher() {
  const router = useRouter();
  const isMounted = useIsMounted();
  const { profile, reload: reloadProfile } = useProfileWithReload({
    noCache: true,
  });
  const [placingOrder, setPlacingOrder] = useState<boolean>(false);
  const [haveCreditCard, setHaveCreditCard] = useState<boolean>(false);
  const [orderError, setOrderError] = useState<string>("");
  const [subTotal, setSubTotal] = useState<number>(0);
  const [taxRate, setTaxRate] = useState<number>(0);
  const [emailSuccess, setEmailSuccess] = useState<boolean>(false);

  const noEmail = useMemo(
    () => profile?.email_address == null,
    [profile?.email_address]
  );

  // most likely, user will do the purchase and then see the congratulations page
  useEffect(() => {
    router.prefetch("/store/congrats");
  }, []);

  function onSuccess() {
    reloadProfile();
    setEmailSuccess(true);
  }

  const cart = useAPI("/shopping/cart/get");

  const items = useMemo(() => {
    if (!cart.result) return undefined;
    const x: any[] = [];
    let subTotal = 0;
    for (const item of cart.result) {
      if (!item.checked) continue;
      item.cost = computeCost(item.description);
      subTotal += item.cost.discounted_cost;
      x.push(item);
    }
    setSubTotal(subTotal);
    return x;
  }, [cart.result]);

  if (cart.error) {
    return <Alert type="error" message={cart.error} />;
  }
  if (!items) {
    return <Loading center />;
  }

  async function placeOrder() {
    try {
      setOrderError("");
      setPlacingOrder(true);

      // Success!
      if (!isMounted.current) return;
      // If the user is still viewing the page after the purchase happened, we
      // send them to the congrats page, which shows them what they recently purchased,
      // with links about how to use it, etc.
      router.push("/store/congrats");
    } catch (err) {
      // The purchase failed.
      setOrderError(err.message);
    } finally {
      if (!isMounted.current) return;
      setPlacingOrder(false);
    }
  }

  function ProjectID({
    project_id,
  }: {
    project_id: string;
  }): JSX.Element | null {
    if (!project_id || !isValidUUID(project_id)) return null;
    return (
      <div>
        For project: <code>{project_id}</code>
      </div>
    );
  }

  const columns = [
    {
      responsive: ["xs" as "xs"],
      render: ({ cost, description, project_id }) => {
        return (
          <div>
            <DescriptionColumn cost={cost} description={description} />
            <ProjectID project_id={project_id} />
            <div>
              <b style={{ fontSize: "11pt" }}>
                <DisplayCost cost={cost} simple oneLine />
              </b>
            </div>
          </div>
        );
      },
    },
    {
      responsive: ["sm" as "sm"],
      title: "Product",
      align: "center" as "center",
      render: () => (
        <div style={{ color: "darkblue" }}>
          <Icon name="key" style={{ fontSize: "24px" }} />
          <div style={{ fontSize: "10pt" }}>Site License</div>
        </div>
      ),
    },
    {
      responsive: ["sm" as "sm"],
      width: "60%",
      render: (_, { cost, description, project_id }) => (
        <>
          <DescriptionColumn cost={cost} description={description} />{" "}
          <ProjectID project_id={project_id} />
        </>
      ),
    },
    {
      responsive: ["sm" as "sm"],
      title: "Price",
      align: "right" as "right",
      render: (_, { cost }) => (
        <b style={{ fontSize: "11pt" }}>
          <DisplayCost cost={cost} simple />
        </b>
      ),
    },
  ];

  function PlaceOrderButton() {
    return (
      <Button
        disabled={subTotal == 0 || placingOrder || !haveCreditCard || noEmail}
        style={{ marginTop: "7px", marginBottom: "15px" }}
        size="large"
        type="primary"
        onClick={placeOrder}
      >
        {placingOrder ? (
          <Loading delay={0}>Placing Order...</Loading>
        ) : (
          "Place Your Order"
        )}
      </Button>
    );
  }

  function OrderError() {
    if (!orderError) return null;
    return (
      <Alert
        type="error"
        message={
          <>
            <b>Error placing order:</b> {orderError}
          </>
        }
        style={{ margin: "30px 0" }}
      />
    );
  }

  function emptyCart() {
    return (
      <>
        <h3>
          <Icon name={"shopping-cart"} style={{ marginRight: "5px" }} />
          {cart.result?.length > 0 && (
            <>
              Nothing in Your <SiteName />{" "}
              <A href="/store/cart">Shopping Cart</A> is Selected
            </>
          )}
          {(cart.result?.length ?? 0) == 0 && (
            <>
              Your <SiteName /> <A href="/store/cart">Shopping Cart</A> is Empty
            </>
          )}
        </h3>
        <A href="/store/site-license">Buy a License</A>
      </>
    );
  }

  function nonemptyCart(items) {
    return (
      <>
        <OrderError />
        <Row>
          <Col md={14} sm={24}>
            <div>
              <h3 style={{ fontSize: "16pt" }}>
                <Icon name={"list"} style={{ marginRight: "5px" }} />
                Checkout (<A href="/store/cart">{items.length} items</A>)
              </h3>
              <h4 style={{ fontSize: "13pt", marginTop: "20px" }}>
                1. Payment Method
              </h4>
              <p>
                The default payment method shown below will be used for this
                purchase.
              </p>
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
                <PlaceOrderButton />
                <Terms />
                <OrderSummary items={items} taxRate={taxRate} />
                <span style={{ fontSize: "13pt" }}>
                  <TotalCost items={items} taxRate={taxRate} />
                </span>
              </div>
              <GetAQuote items={items} />
            </div>
          </Col>
        </Row>

        <h4 style={{ fontSize: "13pt", marginTop: "15px" }}>
          2. Review Items ({items.length})
        </h4>
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
          3. Place Your Order
        </h4>
        <div style={{ fontSize: "12pt" }}>
          <Row>
            <Col sm={12}>
              <PlaceOrderButton />
            </Col>
            <Col sm={12}>
              <div style={{ fontSize: "15pt" }}>
                <TotalCost items={cart.result} taxRate={taxRate} />
                <br />
                <Terms />
              </div>
            </Col>
          </Row>
        </div>
      </>
    );
  }

  function RequireEmailAddressDescr(): JSX.Element {
    if (emailSuccess) {
      return (
        <Paragraph>
          Your email address is now:{" "}
          <Text code>{profile?.email_address ?? ""}</Text>.
        </Paragraph>
      );
    } else {
      return (
        <Paragraph
          style={{
            backgroundColor: "white",
            padding: "20px",
            borderRadius: "10px",
          }}
        >
          <ChangeEmailAddress embedded={true} onSuccess={onSuccess} />
        </Paragraph>
      );
    }
  }

  function RequireEmailAddressMesg(): JSX.Element {
    return (
      <>
        <Title level={2}>
          <Icon name="envelope" />{" "}
          {!emailSuccess ? "Missing Email Address" : "Email Address Saved"}
        </Title>
        {!emailSuccess && (
          <Paragraph>
            To place an order, we need to know an email address of yours. Please
            save it to your profile:
          </Paragraph>
        )}
      </>
    );
  }

  function RequireEmailAddress() {
    if (!noEmail && !emailSuccess) return null;

    return (
      <Alert
        style={{ marginBottom: "30px" }}
        type={emailSuccess ? "success" : "error"}
        message={<RequireEmailAddressMesg />}
        description={<RequireEmailAddressDescr />}
      />
    );
  }

  return (
    <>
      {<RequireEmailAddress />}
      {items.length == 0 && emptyCart()}
      {items.length > 0 && nonemptyCart(items)}
      {<OrderError />}
    </>
  );
}

function fullCost(items) {
  let full_cost = 0;
  for (const { cost, checked } of items) {
    if (checked) {
      full_cost += cost.cost;
    }
  }
  return full_cost;
}

function discountedCost(items) {
  let discounted_cost = 0;
  for (const { cost, checked } of items) {
    if (checked) {
      discounted_cost += cost.discounted_cost;
    }
  }
  return discounted_cost;
}

function TotalCost({ items, taxRate }) {
  const cost = discountedCost(items) * (1 + taxRate);
  return (
    <>
      Total: <b style={{ float: "right", color: "darkred" }}>{money(cost)}</b>
    </>
  );
}

function OrderSummary({ items, taxRate }) {
  const cost = discountedCost(items);
  const full = fullCost(items);
  const tax = cost * taxRate;
  return (
    <Paragraph style={{ textAlign: "left" }}>
      <b style={{ fontSize: "14pt" }}>Order Summary</b>
      <div>
        Items ({items.length}):{" "}
        <span style={{ float: "right" }}>{money(full, true)}</span>
      </div>
      {full - cost > 0 && (
        <div>
          Self-service discount (25%):{" "}
          <span style={{ float: "right" }}>-{money(full - cost, true)}</span>
        </div>
      )}
      <div>
        Estimated tax:{" "}
        <span style={{ float: "right" }}>{money(tax, true)}</span>
      </div>
    </Paragraph>
  );
}

function Terms() {
  return (
    <Paragraph style={{ color: COLORS.GRAY, fontSize: "10pt" }}>
      By placing your order, you agree to{" "}
      <A href="/policies/terms" external>
        our terms of service
      </A>{" "}
      regarding refunds and subscriptions.
    </Paragraph>
  );
}

function DescriptionColumn({ cost, description }) {
  const { input } = cost;
  return (
    <>
      <div style={{ fontSize: "12pt" }}>
        {description.title && (
          <div>
            <b>{description.title}</b>
          </div>
        )}
        {description.description && <div>{description.description}</div>}
        {describeItem({ info: input })}
      </div>
    </>
  );
}

const MIN_AMOUNT = 100;

function GetAQuote({ items }) {
  const router = useRouter();
  const [more, setMore] = useState<boolean>(false);
  let isSub;
  for (const item of items) {
    if (item.description.period != "range") {
      isSub = true;
      break;
    }
  }

  function createSupportRequest() {
    const x: any[] = [];
    for (const item of items) {
      x.push({
        cost: money(item.cost.cost),
        ...copyWithout(item, [
          "account_id",
          "added",
          "removed",
          "purchased",
          "checked",
          "cost",
        ]),
      });
    }
    const body = `Hello,\n\nI would like to request a quote.  I filled out the online form with the\ndetails listed below:\n\n\`\`\`\n${JSON.stringify(
      x,
      undefined,
      2
    )}\n\`\`\``;
    router.push({
      pathname: "/support/new",
      query: {
        hideExtra: true,
        subject: "Request for a quote",
        body,
        type: "question",
      },
    });
  }

  return (
    <Paragraph style={{ paddingTop: "15px" }}>
      <A onClick={() => setMore(!more)}>
        Need to obtain a quote, invoice, modified terms, a purchase order, to
        use PayPal or pay via wire transfer, etc.?
      </A>
      {more && (
        <Paragraph>
          {fullCost(items) <= MIN_AMOUNT || isSub ? (
            <Alert
              showIcon
              style={{
                margin: "15px 0",
                fontSize: "12pt",
                borderRadius: "5px",
              }}
              type="warning"
              message={
                <>
                  Customized payment is available only for{" "}
                  <b>non-subscription purchases over ${MIN_AMOUNT}</b>. Make
                  sure your cost before tax and discounts is over ${MIN_AMOUNT}{" "}
                  and <A href="/store/cart">convert</A> any subscriptions in
                  your cart to explicit date ranges, then try again. If this is
                  confusing, <A href="/support/new">make a support request</A>.
                </>
              }
            />
          ) : (
            <Alert
              showIcon
              style={{
                margin: "15px 0",
                fontSize: "12pt",
                borderRadius: "5px",
              }}
              type="info"
              message={
                <>
                  Click the button below to copy your shopping cart contents to
                  a support request, and we will take if from there. Note that
                  the 25% self-service discount is <b>only available</b> when
                  you purchase from this page.
                  <div style={{ textAlign: "center", marginTop: "5px" }}>
                    <Button onClick={createSupportRequest}>
                      <Icon name="medkit" /> Copy cart to support request
                    </Button>
                  </div>
                </>
              }
            />
          )}
        </Paragraph>
      )}
    </Paragraph>
  );
}
