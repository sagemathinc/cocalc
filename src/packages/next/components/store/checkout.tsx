/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
Checkout -- finalize purchase and pay.
*/
import {
  Alert,
  Button,
  Card,
  Checkbox,
  Divider,
  InputNumber,
  Col,
  Row,
  Space,
  Slider,
  Spin,
} from "antd";
import { useContext, useEffect, useMemo, useState, type JSX } from "react";
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
import {
  getShoppingCartCheckoutParams,
  shoppingCartCheckout,
} from "@cocalc/frontend/purchases/api";
import { currency, plural, round2up, round2down } from "@cocalc/util/misc";
import { type CheckoutParams } from "@cocalc/server/purchases/shopping-cart-checkout";
import { ProductColumn } from "./cart";
import ShowError from "@cocalc/frontend/components/error";
import { StoreBalanceContext } from "../../lib/balance";
import StripePayment from "@cocalc/frontend/purchases/stripe-payment";
import { toFriendlyDescription } from "@cocalc/util/upgrades/describe";
import { creditLineItem } from "@cocalc/util/upgrades/describe";
import { SHOPPING_CART_CHECKOUT } from "@cocalc/util/db-schema/purchases";
import { decimalSubtract } from "@cocalc/util/stripe/calc";

export default function Checkout() {
  const router = useRouter();
  const isMounted = useIsMounted();
  const [completingPurchase, setCompletingPurchase] = useState<boolean>(false);
  const [completedPurchase, setCompletedPurchase] = useState<boolean>(false);
  const [showApplyCredit, setShowApplyCredit] = useState<boolean>(false);
  const [applyCredit, setApplyCredit] = useState<number | null>(0);
  const [lastApplyCredit, setLastApplyCredit] = useState<number | null>(
    applyCredit,
  );
  const [totalCost, setTotalCost] = useState<number>(0);
  const [error, setError] = useState<string>("");
  const { profile, reload: reloadProfile } = useProfileWithReload({
    noCache: true,
  });

  const [userSuccessfullyAddedCredit, setUserSuccessfullyAddedCredit] =
    useState<boolean>(false);
  const { refreshBalance } = useContext(StoreBalanceContext);
  const [paymentAmount, setPaymentAmount0] = useState<number>(0);
  const setPaymentAmount = (amount: number) => {
    // no matter how this is set, always round it up to nearest penny.
    setPaymentAmount0(round2up(amount));
  };
  const [params, setParams] = useState<CheckoutParams | null>(null);
  const updateParams = async (applyCredit0?: number | null) => {
    const applyCredit1 = applyCredit0 ?? applyCredit ?? 0;
    try {
      const params = await getShoppingCartCheckoutParams();
      const cost = params.total;
      setParams(params);
      setTotalCost(round2up(cost));
      setPaymentAmount(cost - applyCredit1);
      setLastApplyCredit(applyCredit1);
    } catch (err) {
      setError(`${err}`);
    }
  };

  const lineItems = useMemo(() => {
    if (params?.cart == null) {
      return [];
    }
    const v = params.cart.map((x) => {
      return {
        description: toFriendlyDescription(x.description),
        amount: x.lineItemAmount,
      };
    });
    const { credit } = creditLineItem({
      lineItems: v,
      amount:
        paymentAmount > 0 ? Math.max(params.minPayment, paymentAmount) : 0,
    });
    if (credit) {
      // add one more line item to make the grand total be equal to amount
      if (credit.amount > 0) {
        credit.description = `${credit.description} -- adjustment so payment is at least ${currency(params.minPayment)}`;
      }
      v.push(credit);
    }
    return v;
  }, [paymentAmount, params]);

  useEffect(() => {
    // on load also get current price, cart, etc.
    updateParams();
  }, []);

  if (error) {
    return <ShowError error={error} setError={setError} />;
  }
  async function completePurchase() {
    try {
      setError("");
      setCompletingPurchase(true);
      await shoppingCartCheckout();
      setCompletedPurchase(true);
      if (isMounted.current) {
        router.push("/store/congrats");
      }
    } catch (err) {
      // The purchase failed.
      setError(err.message);
      setCompletingPurchase(false);
    } finally {
      refreshBalance();
      if (!isMounted.current) {
        return;
      }
      // do NOT set completing purchase back, since the
      // above router.push
      // will move to next page, but we don't want to
      // see the complete purchase button
      // again ever... unless there is an error.
    }
  }

  if (params == null) {
    return (
      <div style={{ textAlign: "center" }}>
        <Spin size="large" tip="Loading" />
      </div>
    );
  }

  let mode;
  if (completingPurchase) {
    mode = "completing";
  } else if (params == null || paymentAmount == 0) {
    mode = "complete";
  } else if (completedPurchase) {
    mode = "completed";
  } else {
    mode = "add";
  }

  function getApplyCreditWarning() {
    if (params == null) {
      return null;
    }
    const balance = params.balance ?? 0;
    if (!balance) {
      return null;
    }
    const max = round2down(
      Math.max(
        0,
        Math.min(params.balance, decimalSubtract(totalCost, params.minPayment)),
      ),
    );
    return (
      <>
        Between{" "}
        <a
          onClick={() => {
            setApplyCredit(0);
            updateParams(0);
          }}
        >
          {currency(0)}
        </a>{" "}
        and{" "}
        <a
          onClick={() => {
            setApplyCredit(max);
            updateParams(max);
          }}
        >
          {currency(max)}
        </a>
        {totalCost <= params.balance && (
          <>
            {" "}
            or exactly{" "}
            <a
              onClick={() => {
                setApplyCredit(totalCost);
                updateParams(totalCost);
              }}
            >
              {currency(totalCost)}
            </a>
            .
          </>
        )}
        <Slider
          min={0}
          max={max}
          tooltip={{
            formatter: (value) => currency(value ?? 0),
          }}
          step={0.01}
          value={applyCredit ?? 0}
          onChange={setApplyCredit}
        />
        The minimum payment size is {currency(params.minPayment)}, which
        constrains the amount of credit that can be applied.
      </>
    );
  }

  return (
    <>
      <div>
        <RequireEmailAddress profile={profile} reloadProfile={reloadProfile} />
        {params.cart.length == 0 && (
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
                  Your <SiteName /> <A href="/store/cart">Shopping Cart</A> is
                  Empty
                </>
              )}
            </h3>
            <br />
            <br />
            You must have at least one item in{" "}
            <A href="/store/cart">your cart</A> to checkout. Shop for{" "}
            <A href="/store/membership">memberships</A>,{" "}
            <A href="/store/site-license">licenses</A>, or{" "}
            <A href="/store/vouchers">vouchers</A>.
          </div>
        )}
        {params.cart.length > 0 && (
          <>
            <ShowError error={error} setError={setError} />
            <Card title={<>Place Your Order</>}>
              <Row>
                <Col
                  sm={12}
                  style={{
                    paddingRight: "30px",
                    borderRight: "1px solid #ddd",
                    display: "flex",
                    justifyContent: "center",
                    alignItems: "center",
                  }}
                >
                  {round2down(params.balance ?? 0) > 0 && (
                    <div>
                      <Checkbox
                        style={{ fontSize: "12pt" }}
                        checked={showApplyCredit}
                        onChange={(e) => {
                          let x = 0;
                          if (e.target.checked) {
                            setShowApplyCredit(true);
                            if (params.balance >= totalCost) {
                              x = totalCost;
                            } else if (
                              params.balance > 0 &&
                              params.balance <= totalCost - params.minPayment
                            ) {
                              x = round2down(params.balance);
                            }
                          } else {
                            setShowApplyCredit(false);
                          }
                          setApplyCredit(x);
                          updateParams(x);
                        }}
                      >
                        <b>
                          Use Account Balance -{" "}
                          <span style={{ color: "#666" }}>
                            {currency(round2down(params.balance))} available
                          </span>
                        </b>
                      </Checkbox>
                      {showApplyCredit && (
                        <div style={{ textAlign: "center", marginTop: "30px" }}>
                          <Space.Compact>
                            <InputNumber
                              value={applyCredit}
                              disabled={round2down(params.balance ?? 0) <= 0}
                              min={0}
                              max={Math.max(
                                0,
                                Math.min(totalCost, params.balance),
                              )}
                              addonBefore="$"
                              onChange={(value) => setApplyCredit(value)}
                              onPressEnter={() => {
                                updateParams(applyCredit);
                              }}
                            />
                            <Button
                              type="primary"
                              disabled={
                                round2down(params.balance ?? 0) <= 0 ||
                                applyCredit == lastApplyCredit
                              }
                              onClick={() => {
                                updateParams(applyCredit);
                              }}
                            >
                              Apply
                            </Button>
                          </Space.Compact>
                          {applyCredit != totalCost &&
                            applyCredit != params.balance && (
                              <Alert
                                showIcon
                                style={{ marginTop: "30px", textAlign: "left" }}
                                message={getApplyCreditWarning()}
                              />
                            )}
                        </div>
                      )}
                    </div>
                  )}
                </Col>
                <Col sm={12} style={{ paddingLeft: "30px" }}>
                  <div style={{ fontSize: "15pt" }}>
                    <Terms />
                  </div>
                </Col>
              </Row>
              <GetAQuote items={params.cart} />

              <div style={{ textAlign: "center" }}>
                <Divider />
                {mode == "completing" && (
                  <Alert
                    showIcon
                    style={{ margin: "30px auto", maxWidth: "700px" }}
                    type="success"
                    message={
                      <>
                        Transferring the items in your cart to your account...
                        <Spin style={{ marginLeft: "10px" }} />
                      </>
                    }
                  />
                )}
              </div>
              {!userSuccessfullyAddedCredit && (
                <div>
                  <StripePayment
                    description={`Purchasing ${params.cart.length} ${plural(params.cart, "item")} in the CoCalc store.`}
                    style={{ maxWidth: "600px", margin: "30px auto" }}
                    lineItems={lineItems}
                    purpose={SHOPPING_CART_CHECKOUT}
                    metadata={{
                      cart_ids: JSON.stringify(
                        params.cart.map((item) => item.id),
                      ),
                    }}
                    onFinished={async () => {
                      setUserSuccessfullyAddedCredit(true);
                      // user paid successfully and money should be in their account
                      await refreshBalance();
                      if (!isMounted.current) {
                        return;
                      }
                      if (paymentAmount <= 0) {
                        // now do the purchase flow with money available.
                        await completePurchase();
                      } else {
                        // actually paid something so processing happens on the backend in response
                        // to payment completion
                        router.push("/store/processing");
                      }
                    }}
                  />
                </div>
              )}
              {completingPurchase ||
              totalCost >= params.minPayment ||
              params == null ||
              totalCost <= 0 ||
              paymentAmount >= params.minPayment ? null : (
                <Alert
                  showIcon
                  type="warning"
                  style={{ marginTop: "15px" }}
                  message={
                    <>
                      The minimum payment amount is{" "}
                      {currency(params.minPayment)}. Extra money you deposit for
                      this purchase can be used toward future purchases.
                    </>
                  }
                />
              )}
            </Card>
          </>
        )}
        <ShowError error={error} setError={setError} />
      </div>
    </>
  );
}

export function fullCost(items) {
  let full_cost = 0;
  for (const { cost, checked } of items) {
    if (checked) {
      full_cost += cost.cost_sub_first_period ?? cost.cost;
    }
  }
  return full_cost;
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
  if (description?.type == "membership") {
    return (
      <div style={{ fontSize: "12pt" }}>
        Membership: {description.class} ({description.interval})
      </div>
    );
  }
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
    if (item.description.period != "range" && item.product == "site-license") {
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
      2,
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
      <div style={{ textAlign: "right" }}>
        <A onClick={() => setMore(!more)}>
          Need a quote, invoice or modified terms?
        </A>
      </div>
      {more && (
        <Paragraph>
          {fullCost(items) < MIN_AMOUNT || isSub ? (
            <Alert
              showIcon
              style={{
                margin: "15px 0",
                fontSize: "12pt",
                borderRadius: "5px",
              }}
              type="warning"
              message={"Customized Payment Options"}
              description={
                <>
                  Customized payment options are available for{" "}
                  <b>non-subscription purchases over ${MIN_AMOUNT}</b>. Make
                  sure your cost (currently {currency(fullCost(items))}) is over
                  ${MIN_AMOUNT} and <A href="/store/cart">edit</A> any
                  subscriptions in your cart to have explicit date ranges, then
                  try again. If this is confusing,{" "}
                  <A href="/support/new">make a support request</A>.
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
              message={"Customized Payment Options"}
              description={
                <>
                  Click the button below to copy your shopping cart contents to
                  a support request, and we will take if from there!
                  <div style={{ textAlign: "center", marginTop: "15px" }}>
                    <Button
                      type="primary"
                      size="large"
                      onClick={createSupportRequest}
                    >
                      <Icon name="medkit" /> Copy Shopping Cart to a Support
                      Request
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
      render: (_, { product }) => <ProductColumn product={product} />,
    },
    {
      responsive: ["sm" as "sm"],
      width: "60%",
      render: (_, { cost, description, project_id }) => {
        if (cost == null) {
          return null;
        }
        return (
          <>
            <DescriptionColumn
              cost={cost}
              description={description}
              voucherPeriod={voucherPeriod}
            />{" "}
            <ProjectID project_id={project_id} />
          </>
        );
      },
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
  ] as any;
}

function ProjectID({ project_id }: { project_id: string }): JSX.Element | null {
  if (!project_id || !isValidUUID(project_id)) return null;
  return (
    <div>
      For project: <code>{project_id}</code>
    </div>
  );
}
