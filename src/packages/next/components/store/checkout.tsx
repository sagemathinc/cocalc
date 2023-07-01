/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
Checkout -- finalize purchase and pay.
*/
import { Alert, Button, Card, Divider, Col, Row, Spin, Table } from "antd";
import { useEffect, useState } from "react";
import { Icon } from "@cocalc/frontend/components/icon";
import { money } from "@cocalc/util/licenses/purchase/utils";
import { copy_without as copyWithout, isValidUUID } from "@cocalc/util/misc";
import A from "components/misc/A";
import SiteName from "components/share/site-name";
import useIsMounted from "lib/hooks/mounted";
import { useRouter } from "next/router";
import { describeItem, DisplayCost } from "./site-license-cost";
import { useProfileWithReload } from "lib/hooks/profile";
import { Paragraph, Title, Text } from "components/misc";
import { COLORS } from "@cocalc/util/theme";
import { ChangeEmailAddress } from "components/account/config/account/email";
import * as purchasesApi from "@cocalc/frontend/purchases/api";
import { currency } from "@cocalc/frontend/purchases/util";
import type { CheckoutParams } from "@cocalc/server/purchases/shopping-cart-checkout";

export default function Checkout() {
  const router = useRouter();
  const isMounted = useIsMounted();
  const [completingPurchase, setCompletingPurchase] = useState<boolean>(false);
  const [error, setError] = useState<string>("");
  const { profile, reload: reloadProfile } = useProfileWithReload({
    noCache: true,
  });
  const [session, setSession] = useState<{ id: string; url: string } | null>(
    null
  );
  const [params, setParams] = useState<CheckoutParams | null>(null);

  const updateSession = async () => {
    const session = await purchasesApi.getCurrentCheckoutSession();
    setSession(session);
    return session;
  };

  const updateParams = async () => {
    try {
      setParams(await purchasesApi.getShoppingCartCheckoutParams());
    } catch (err) {
      setError(`${err}`);
    }
  };

  useEffect(() => {
    // on load, check for existing payent session.
    updateSession();
    // on load also get current price, cart, etc.
    updateParams();
  }, []);

  if (error) {
    return (
      <Alert
        type="error"
        message="Error"
        description={error}
        closable
        onClose={updateParams}
      />
    );
  }
  async function completePurchase() {
    try {
      setError("");
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
      const result = await purchasesApi.shoppingCartCheckout({
        success_url,
        cancel_url: currentUrl,
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
      setError(err.message);
    } finally {
      if (!isMounted.current) return;
      setCompletingPurchase(false);
    }
  }

  const cancelPurchaseInProgress = async () => {
    try {
      await purchasesApi.cancelCurrentCheckoutSession();
      updateSession();
      updateParams();
    } catch (err) {
      setError(err.message);
    }
  };

  // handle ?complete -- i.e., what happens after successfully paying
  // for a purchase - we do ANOTHER completePurchase, and for the second
  // one no additional payment is required, so in this case user actually
  // gets the items and goes to the congrats page.  Unless, of course,
  // they try to be sneaky and add something to their cart right *after*
  // paying... in which case they will just get asked for additional
  // money for that last thing. :-)
  useEffect(() => {
    if (router.query.complete == null) {
      // nothing to handle
      return;
    }
    completePurchase();
  }, []);

  if (params == null) {
    return (
      <div style={{ textAlign: "center" }}>
        <Spin size="large" tip="Loading" />
      </div>
    );
  }

  const columns = getColumns();

  function CompletePurchase() {
    return (
      <Button
        disabled={
          params?.total == 0 ||
          completingPurchase ||
          !profile?.email_address ||
          session != null
        }
        style={{ marginTop: "7px", marginBottom: "15px" }}
        size="large"
        type="primary"
        onClick={completePurchase}
      >
        {completingPurchase ? (
          <>
            Completing Purchase...
            <Spin />
          </>
        ) : (
          `Complete Purchase${session != null ? " (finish payment first)" : ""}`
        )}
      </Button>
    );
  }

  function EmptyCart() {
    if (params == null) return null;
    return (
      <div style={{ maxWidth: "800px", margin: "auto" }}>
        <h3>
          <Icon name={"shopping-cart"} style={{ marginRight: "5px" }} />
          {params.cart.length > 0 && (
            <>
              Nothing in Your <SiteName />{" "}
              <A href="/store/cart">Shopping Cart</A> is Selected
            </>
          )}
          {(params.cart.length ?? 0) == 0 && (
            <>
              Your <SiteName /> <A href="/store/cart">Shopping Cart</A> is Empty
            </>
          )}
        </h3>
        <br />
        <br />
        You must have at least one item in <A href="/store/cart">
          your cart
        </A>{" "}
        to checkout. Shop for <A href="/store/site-license">upgrades</A>, a{" "}
        <A href="/store/boost">license boost</A>, or a{" "}
        <A href="/dedicated">dedicated VM or disk</A>.
      </div>
    );
  }

  function NonemptyCart() {
    if (params == null) return null;
    const items = params.cart;
    return (
      <>
        <ShowError error={error} />
        <Card title={<>1. Review Items ({items.length})</>}>
          <Table
            showHeader={false}
            columns={columns}
            dataSource={items}
            rowKey={"id"}
            pagination={{ hideOnSinglePage: true }}
          />
          <GetAQuote items={items} />
        </Card>

        <div style={{ height: "30px" }} />

        <Card title={<>2. Place Your Order</>}>
          <ExplainPaymentSituation
            params={params}
            style={{ margin: "15px 0" }}
          />
          <Row>
            <Col sm={12}>
              <CompletePurchase />
            </Col>
            <Col sm={12}>
              <div style={{ fontSize: "15pt" }}>
                <TotalCost items={items} />
                <br />
                <Terms />
              </div>
            </Col>
          </Row>
        </Card>
      </>
    );
  }

  return (
    <>
      {session != null && (
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
      )}
      <div style={session != null ? { opacity: 0.4 } : undefined}>
        <RequireEmailAddress profile={profile} reloadProfile={reloadProfile} />
        {params.cart.length == 0 && <EmptyCart />}
        {params.cart.length > 0 && <NonemptyCart />}
        <ShowError error={error} />
      </div>
    </>
  );
}

export function fullCost(items) {
  let full_cost = 0;
  for (const { cost, checked } of items) {
    if (checked) {
      full_cost += cost.cost;
    }
  }
  return full_cost;
}

export function discountedCost(items) {
  let discounted_cost = 0;
  for (const { cost, checked } of items) {
    if (checked) {
      discounted_cost += cost.discounted_cost;
    }
  }
  return discounted_cost;
}

function TotalCost({ items }) {
  const cost = discountedCost(items);
  return (
    <>
      Total: <b style={{ float: "right", color: "darkred" }}>{money(cost)}</b>
    </>
  );
}

function Terms() {
  return (
    <Paragraph
      style={{ color: COLORS.GRAY, fontSize: "10pt", marginTop: "8px" }}
    >
      By placing your order, you agree to{" "}
      <A href="/policies/terms" external>
        our terms of service
      </A>{" "}
      regarding refunds and subscriptions.
    </Paragraph>
  );
}

export function DescriptionColumn({ cost, description, voucherPeriod }) {
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
        {describeItem({ info: input, voucherPeriod })}
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
                  sure your cost before discounts is over ${MIN_AMOUNT} and{" "}
                  <A href="/store/cart">convert</A> any subscriptions in your
                  cart to explicit date ranges, then try again. If this is
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

function RequireEmailAddressDescr({
  emailSuccess,
  onSuccess,
  profile,
}): JSX.Element {
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

function RequireEmailAddressMesg({ emailSuccess }): JSX.Element {
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

export function RequireEmailAddress({ profile, reloadProfile }) {
  const [emailSuccess, setEmailSuccess] = useState<boolean>(false);

  if (profile == null) {
    // profile not yet loaded.
    // there was a bug where it would flash the alert below while
    // loading the user's profile, which looks really dumb.
    return null;
  }
  if (profile?.email_address != null && !emailSuccess) {
    // address is defined, and they didn't just set it (so we don't
    // have to show a message confirming that), then nothing to do.
    return null;
  }

  return (
    <Alert
      style={{ marginBottom: "30px" }}
      type={emailSuccess ? "success" : "error"}
      message={<RequireEmailAddressMesg emailSuccess={emailSuccess} />}
      description={
        <RequireEmailAddressDescr
          emailSuccess={emailSuccess}
          profile={profile}
          onSuccess={() => {
            reloadProfile();
            setEmailSuccess(true);
          }}
        />
      }
    />
  );
}

export function ShowError({ error }) {
  if (!error) return null;
  return (
    <Alert
      type="error"
      message="Error"
      description={<>{error}</>}
      style={{ margin: "30px 0" }}
    />
  );
}

export function getColumns({
  noDiscount,
  voucherPeriod,
}: { noDiscount?: boolean; voucherPeriod?: boolean } = {}) {
  return [
    {
      responsive: ["xs" as "xs"],
      render: ({ cost, description, project_id }) => {
        return (
          <div>
            <DescriptionColumn
              cost={cost}
              description={description}
              voucherPeriod={voucherPeriod}
            />
            <ProjectID project_id={project_id} />
            <div>
              <b style={{ fontSize: "11pt" }}>
                <DisplayCost
                  cost={cost}
                  simple
                  oneLine
                  noDiscount={noDiscount}
                />
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
          <div style={{ fontSize: "10pt" }}>License</div>
        </div>
      ),
    },
    {
      responsive: ["sm" as "sm"],
      width: "60%",
      render: (_, { cost, description, project_id }) => (
        <>
          <DescriptionColumn
            cost={cost}
            description={description}
            voucherPeriod={voucherPeriod}
          />{" "}
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
          <DisplayCost cost={cost} simple noDiscount={noDiscount} />
        </b>
      ),
    },
  ];
}

function ProjectID({ project_id }: { project_id: string }): JSX.Element | null {
  if (!project_id || !isValidUUID(project_id)) return null;
  return (
    <div>
      For project: <code>{project_id}</code>
    </div>
  );
}

function ExplainPaymentSituation({
  params,
  style,
}: {
  params: CheckoutParams | null;
  style?;
}) {
  if (params == null) {
    return <Spin />;
  }
  const { balance, minPayment, amountDue, chargeAmount, total, minBalance } =
    params;
  const curBalance = (
    <div style={{ float: "right" }}>
      Current balance: {currency(balance)}
      {minBalance ? `, Minimum allowed balance: ${currency(minBalance)}` : ""}
    </div>
  );

  if (chargeAmount == 0) {
    return (
      <Alert
        type="info"
        style={style}
        message={<>{curBalance}No payment required</>}
        description={
          <>
            <b>You can complete this purchase without making a payment now</b>,
            since your account balance is {currency(balance)}, which is at least{" "}
            {currency(total)}.
          </>
        }
      />
    );
  }
  if (chargeAmount == minPayment) {
    return (
      <Alert
        type="info"
        style={style}
        message={<>{curBalance}Minimal payment required</>}
        description={
          <>
            <b>
              To complete this purchase, pay {currency(chargeAmount)} (+ TAX).
            </b>{" "}
            {chargeAmount > amountDue && (
              <>
                This is more than {currency(amountDue)}, since our minimum
                transaction amount is {currency(minPayment)}. The difference
                will be credited to your account, and you can use it toward
                future purchases.
              </>
            )}
          </>
        }
      />
    );
  }
  return (
    <Alert
      type="info"
      style={style}
      message={<>{curBalance}Payment required</>}
      description={
        <>
          <b>
            To complete this purchase, you must pay {currency(chargeAmount)} (+
            TAX) to add sufficient credit to your account
          </b>
          .{" "}
          {chargeAmount > total && (
            <>
              This is larger than the total, because your account balance must
              always be at least {currency(params.minBalance)}.
            </>
          )}
        </>
      }
    />
  );
}
