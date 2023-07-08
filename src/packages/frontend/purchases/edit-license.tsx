/* 
Frontend react component that enables any user to edit the parameters
of a license **they purchased**.  They may have to pay for changes they 
make, or get a refund. 
*/

import { Alert, Button, Card, Divider, Popconfirm, Spin } from "antd";
import { useEffect, useState } from "react";
import { getLicense, editLicense, isPurchaseAllowed } from "./api";
import { Icon } from "@cocalc/frontend/components/icon";
import LicenseEditor from "./license-editor";
import type { PurchaseInfo } from "@cocalc/util/licenses/purchase/types";
import costToEditLicense from "@cocalc/util/purchases/cost-to-edit-license";
import { currency } from "./util";
import type { Changes } from "@cocalc/util/purchases/cost-to-edit-license";
import { isEqual } from "lodash";
import { webapp_client } from "@cocalc/frontend/webapp-client";

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
  const [cost, setCost] = useState<number>(0);
  const [makingChange, setMakingChange] = useState<boolean>(false);

  const isSubscription =
    info?.type != "vouchers" &&
    info?.subscription != null &&
    info?.subscription != "no";

  const fetchLicense = async () => {
    try {
      setLoading(true);
      const license = await getLicense(license_id);
      setLicense(license);
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
      <Divider>
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
                      cost
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
                <Button disabled={!cost || makingChange} type="primary">
                  {cost > 0 && (
                    <>Change License -- you will be charged {currency(cost)}</>
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
                message="Subscription License"
                description="This is a subscription license, so editing it will also impact the cost of your monthly subscription going forward."
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
