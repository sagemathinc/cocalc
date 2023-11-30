/*
Frontend react component that enables any user to edit the parameters
of a license **they purchased**.  They may have to pay for changes they
make, or get a refund.
*/

import { Alert, Button, Card, Divider, Popconfirm, Spin } from "antd";
import { useEffect, useState } from "react";
import {
  getLicense,
  editLicense,
  getSubscription,
  isPurchaseAllowed,
} from "./api";
import { Icon } from "@cocalc/frontend/components/icon";
import LicenseEditor from "./license-editor";
import type { PurchaseInfo } from "@cocalc/util/licenses/purchase/types";
import type { Subscription } from "@cocalc/util/db-schema/subscriptions";
import costToEditLicense from "@cocalc/util/purchases/cost-to-edit-license";
import { currency } from "@cocalc/util/misc";
import type { Changes } from "@cocalc/util/purchases/cost-to-edit-license";
import { isEqual } from "lodash";
import { webapp_client } from "@cocalc/frontend/webapp-client";
import { compute_cost } from "@cocalc/util/licenses/purchase/compute-cost";

interface Props {
  license_id: string;
  refresh?: () => void;
}

interface License {
  account_id: string;
  info: PurchaseInfo;
  number_running: number;
  title: string;
  description: string;
}
export default function EditLicense({ license_id, refresh }: Props) {
  const [license, setLicense] = useState<License | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>("");
  const [editError, setEditError] = useState<string>("");
  const [modifiedInfo, setModifiedInfo] = useState<PurchaseInfo | null>(null);
  const [info, setInfo] = useState<PurchaseInfo | null>(null);
  const [makingChange, setMakingChange] = useState<boolean>(false);

  // the charge right now to make changes to the license
  const [cost, setCost] = useState<number>(0);

  // If this is a subscription license, this the subscription before making
  // any the changes.
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  // And this is the new monthly subscription cost *after* making the changes.
  const [modifiedSubscriptionCost, setModifiedSubscriptionCost] = useState<
    number | null
  >(null);

  const isSubscription =
    info?.type != "vouchers" &&
    info?.subscription != null &&
    info?.subscription != "no";

  const fetchLicense = async () => {
    try {
      setLoading(true);
      const license = await getLicense(license_id);
      setLicense(license);
      if (license.subscription_id) {
        setSubscription(await getSubscription(license.subscription_id));
      }
      const info = license.info?.purchased ?? null;
      if (info != null) {
        if (info.start != null) {
          info.start = new Date(info.start);
        }
        if (info.end != null) {
          info.end = new Date(info.end);
        }
      }
      setInfo(info);
      setModifiedInfo(info);
      setCost(0);
    } catch (err) {
      setError(`${err}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (info == null || modifiedInfo == null) {
      setCost(0);
      return;
    }
    try {
      setEditError("");
      setCost(costToChange(info, modifiedInfo));
      setModifiedSubscriptionCost(compute_cost(modifiedInfo).discounted_cost);
    } catch (err) {
      setEditError(`${err}`);
    }
  }, [info, modifiedInfo]);

  if (error) {
    return (
      <Alert type="error" message="Error Loading License" description={error} />
    );
  }
  return (
    <div>
      <Divider orientation="left">
        <Button
          disabled={loading}
          onClick={() => {
            if (license) {
              setLicense(null);
            } else {
              fetchLicense();
            }
          }}
        >
          <Icon name="pencil" /> Edit{license != null ? "ing" : ""} License...{" "}
          {loading && <Spin />}
        </Button>
      </Divider>
      {license != null && modifiedInfo != null && info != null && (
        <Card
          title={
            <div style={{ textAlign: "center" }}>
              <Button
                style={{ marginRight: "8px" }}
                onClick={() => {
                  setModifiedInfo(info);
                  setLicense(null);
                }}
              >
                Cancel
              </Button>
              <Popconfirm
                title="Change the license"
                description="Are you sure to change this license?"
                onConfirm={async () => {
                  const changes = getChanges(info, modifiedInfo);
                  const service = "edit-license";
                  try {
                    setMakingChange(true);
                    const { allowed, reason } = await isPurchaseAllowed(
                      service,
                      cost,
                    );
                    if (!allowed) {
                      await webapp_client.purchases_client.quotaModal({
                        service,
                        reason,
                        allowed,
                        cost,
                      });
                    }
                    if ((await isPurchaseAllowed(service, cost)).allowed) {
                      await editLicense({ license_id, changes });
                      refresh?.();
                      setLicense(null);
                    } else {
                      throw Error("unable to complete purchase");
                    }
                  } catch (err) {
                    setEditError(`${err}`);
                  } finally {
                    setMakingChange(false);
                  }
                }}
                okText="Yes"
                cancelText="No"
              >
                <Button
                  style={{ marginRight: "8px" }}
                  disabled={!cost || makingChange}
                  type="primary"
                >
                  {cost > 0 && (
                    <>Change License -- pay {currency(cost)} change fee</>
                  )}
                  {cost < 0 && (
                    <>
                      Change License -- your account will be credited{" "}
                      {currency(-cost)}
                    </>
                  )}
                  {cost == 0 && <>Edit license below</>}
                </Button>
              </Popconfirm>
            </div>
          }
          style={{ maxWidth: "600px", margin: "auto" }}
        >
          {editError && (
            <Alert
              type="error"
              message="Error Editing License"
              description={editError}
              style={{ margin: "15px 0" }}
            />
          )}
          <div style={{ marginBottom: "15px", color: "#666" }}>
            {isSubscription && (
              <Alert
                showIcon
                style={{ margin: "15px" }}
                type="info"
                message=<>
                  Subscription{" "}
                  {subscription != null &&
                    modifiedSubscriptionCost != null &&
                    modifiedSubscriptionCost != subscription.cost && (
                      <>
                        cost:{" "}
                        <b>
                          {currency(modifiedSubscriptionCost)}/
                          {subscription.interval}
                        </b>
                      </>
                    )}
                </>
                description=<>
                  {subscription?.cost != null && (
                    <div>
                      {" "}
                      Current cost: {currency(subscription?.cost)}/
                      {subscription.interval}.
                    </div>
                  )}
                  {subscription != null &&
                    modifiedSubscriptionCost != null &&
                    modifiedSubscriptionCost != subscription.cost && (
                      <div>
                        <b>
                          New cost: {currency(modifiedSubscriptionCost)}/
                          {subscription.interval}.
                        </b>
                      </div>
                    )}
                  <hr />
                  <div style={{ color: "#666" }}>
                    This is a subscription license, so editing it may impact the
                    cost of your subscription going forward. The new
                    subscription cost will be computed at the current rates.
                  </div>
                </>
              />
            )}
            <Button
              style={{ float: "right" }}
              type="text"
              onClick={() => setModifiedInfo(info)}
              disabled={isEqual(modifiedInfo, info) || makingChange}
            >
              Reset
            </Button>
          </div>
          <LicenseEditor
            cellStyle={{ margin: "8px" }}
            info={modifiedInfo}
            onChange={setModifiedInfo}
            disabledFields={
              (info as any).start != null && (info as any).start <= new Date()
                ? new Set(["start"])
                : undefined
            }
          />
          <div style={{ marginTop: "15px" }}>
            You may edit a license at any time, but{" "}
            <b>projects using the license might be restarted</b>.
            {cost != 0 && (
              <span>
                {" "}
                The {cost >= 0 ? "charge" : "credit"} of{" "}
                <b>{currency(Math.abs(cost))}</b> is the prorated difference
                between the cost of the original license and the edited one.
              </span>
            )}
            {info.type !== "quota" && (
              <div>
                <b>
                  NOTE: This is an old license, so license editing is not
                  available.
                </b>
              </div>
            )}
          </div>
        </Card>
      )}
    </div>
  );
}

function getChanges(info: PurchaseInfo, modifiedInfo: PurchaseInfo): Changes {
  const changes: Changes = {};
  for (const key in info) {
    if (
      modifiedInfo[key] != null &&
      JSON.stringify(info[key]) != JSON.stringify(modifiedInfo[key])
    ) {
      changes[key] = modifiedInfo[key];
    }
  }
  return changes;
}

function costToChange(info: PurchaseInfo, modifiedInfo: PurchaseInfo): number {
  return costToEditLicense(info, getChanges(info, modifiedInfo)).cost;
}
