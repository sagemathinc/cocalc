/*
Checkout -- finalize purchase and pay.
*/

import { useMemo, useState } from "react";
import useAPI from "lib/hooks/api";
import { Icon } from "@cocalc/frontend/components/icon";
import Loading from "components/share/loading";
import { Alert, Button, Row, Col, Table } from "antd";
import { computeCost, DisplayCost } from "./site-license-cost";
import { describe_quota } from "@cocalc/util/db-schema/site-licenses";
import { money } from "@cocalc/util/licenses/purchase/util";
import SiteName from "components/share/site-name";
import A from "components/misc/A";
import useIsMounted from "lib/hooks/mounted";
import PaymentMethods from "components/billing/payment-methods";
import { copy_without as copyWithout, plural } from "@cocalc/util/misc";
import { useRouter } from "next/router";

export default function Checkout() {
  const isMounted = useIsMounted();
  const [placingOrder, setPlacingOrder] = useState<boolean>(false);
  const [subTotal, setSubTotal] = useState<number>(0);
  const [taxRate, setTaxRate] = useState<number>(0);
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
      setPlacingOrder(true);
    } finally {
      if (!isMounted.current) return;
      setPlacingOrder(false);
    }
  }

  const columns = [
    {
      responsive: ["xs" as "xs"],
      render: ({ cost, description }) => {
        return (
          <div>
            <DescriptionColumn cost={cost} description={description} />
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
      render: (_, { cost, description }) => (
        <DescriptionColumn cost={cost} description={description} />
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

  return (
    <div style={{ maxWidth: "900px", margin: "auto" }}>
      {items.length == 0 && (
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
                Your <SiteName /> <A href="/store/cart">Shopping Cart</A> is
                Empty
              </>
            )}
          </h3>
          <A href="/store/site-license">Buy a License</A>
        </>
      )}
      {items.length > 0 && (
        <div>
          <div style={{ maxWidth: "900px", margin: "auto" }}>
            <Row>
              <Col md={15} sm={24}>
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
                  <PaymentMethods startMinimized setTaxRate={setTaxRate} />
                </div>
              </Col>
              <Col md={{ offset: 1, span: 8 }} sm={{ span: 24, offset: 0 }}>
                <div>
                  <div
                    style={{
                      textAlign: "center",
                      border: "1px solid #ddd",
                      padding: "15px",
                      borderRadius: "5px",
                    }}
                  >
                    <Button
                      disabled={subTotal == 0 || placingOrder}
                      style={{ margin: "15px 0" }}
                      size="large"
                      type="primary"
                      href="/store/checkout"
                      onClick={placeOrder}
                    >
                      Place Your Order
                    </Button>

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
                  <Button
                    disabled={subTotal == 0 || placingOrder}
                    style={{ marginTop: "7px", marginBottom: "15px" }}
                    size="large"
                    type="primary"
                    href="/store/checkout"
                    onClick={placeOrder}
                  >
                    Place Your Order
                  </Button>
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
          </div>
        </div>
      )}
    </div>
  );
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
  const tax = cost * taxRate;
  return (
    <div style={{ textAlign: "left" }}>
      <b style={{ fontSize: "14pt" }}>Order Summary</b>
      <div>
        Items ({items.length}):{" "}
        <span style={{ float: "right" }}>{money(cost)}</span>
      </div>
      <div>
        Estimated tax: <span style={{ float: "right" }}>{money(tax)}</span>
      </div>
    </div>
  );
}

function Terms() {
  return (
    <div style={{ color: "#666", fontSize: "10pt" }}>
      By placing your order, you agree to{" "}
      <A href="/policies/terms" external>
        our terms of service
      </A>{" "}
      regarding refunds and subscriptions.
    </div>
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
        {describe_quota({
          ram: input.custom_ram,
          cpu: input.custom_cpu,
          disk: input.custom_disk,
          always_running: input.custom_always_running,
          member: input.custom_member,
          user: input.user,
        })}
        <span>
          {" "}
          to up to {description.runLimit} simultaneous running{" "}
          {plural(description.runLimit, "project")}
        </span>
      </div>
    </>
  );
}

const MIN_AMOUNT = 100;

function GetAQuote({ items }) {
  const router = useRouter();
  const [more, setMore] = useState<boolean>(false);
  const cost = discountedCost(items);
  let isSub;
  for (const item of items) {
    if (item.description.period != "range") {
      isSub = true;
      break;
    }
  }

  function createSupportRequest() {
    const x : any[] = [];
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
    <div style={{ paddingTop: "15px" }}>
      <A onClick={() => setMore(true)}>
        Need to obtain a quote, invoice, modified terms, a purchase order, to
        use PayPal or pay via wire transfer, etc.?
      </A>
      {more && (
        <div>
          {cost < MIN_AMOUNT || isSub ? (
            <i>
              Customized payment is not available for{" "}
              <b>purchases under ${MIN_AMOUNT} or subscription</b>; make sure
              pre-tax total is at least ${MIN_AMOUNT} and convert any
              subscriptions in your cart to explicit date ranges, then try
              again.
            </i>
          ) : (
            <>
              Click the button below to copy your shopping cart contents to a
              support request. Note that the 25% self-service discount included
              in the total here is not available with quotes.
              <div style={{ textAlign: "center", marginTop: "5px" }}>
                <Button onClick={createSupportRequest}>
                  <Icon name="medkit" /> Copy cart to support request
                </Button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
