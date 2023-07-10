import { Alert, Button, Card, Checkbox, DatePicker, Divider, Spin } from "antd";
import { useEffect, useMemo, useState } from "react";
import { webapp_client } from "@cocalc/frontend/webapp-client";
import { Gap, Icon, TimeAgo } from "@cocalc/frontend/components";
import LicenseEditor from "@cocalc/frontend/purchases/license-editor";
import { currency } from "@cocalc/frontend/purchases/util";
import type { PurchaseInfo } from "@cocalc/util/licenses/purchase/types";
import { compute_cost } from "@cocalc/util/licenses/purchase/compute-cost";
import MoneyStatistic from "@cocalc/frontend/purchases/money-statistic";
import dayjs from "dayjs";
import { isEqual } from "lodash";

const DEFAULT_PURCHASE_INFO = {
  type: "quota",
  user: "academic",
  upgrade: "custom",
  quantity: 1,
  subscription: "no",
  custom_cpu: 1,
  custom_dedicated_cpu: 0,
  custom_ram: 4,
  custom_dedicated_ram: 0,
  custom_disk: 3,
  custom_member: true,
  custom_uptime: "short",
} as const;

export default function StudentPay({ actions, settings }) {
  const [minPayment, setMinPayment] = useState<number | undefined>(undefined);
  const updateMinPayment = () => {
    (async () => {
      setMinPayment(await webapp_client.purchases_client.getMinimumPayment());
    })();
  };
  useEffect(() => {
    updateMinPayment();
  }, []);

  const [when, setWhen] = useState<dayjs.Dayjs>(
    settings.get("pay") ? dayjs(settings.get("pay")) : dayjs().add(7, "day")
  );
  const [info, setInfo] = useState<PurchaseInfo>(() => {
    const cur = settings.get("payInfo")?.toJS();
    if (cur != null) {
      return cur;
    }
    const info = {
      ...DEFAULT_PURCHASE_INFO,
      start: new Date(),
      end: dayjs().add(3, "month").toDate(),
    } as PurchaseInfo;
    actions.configuration.setStudentPay({ info, cost });
    return info;
  });

  if (info.type == "vouchers") {
    // for typescript
    throw Error("bug");
  }

  const cost = useMemo(() => {
    try {
      return compute_cost(info).discounted_cost;
    } catch (_) {
      return null;
    }
  }, [info]);

  const [showStudentPay, setShowStudentPay] = useState<boolean>(false);
  const reset = () => {
    const cur = settings.get("payInfo")?.toJS();
    if (cur != null) {
      setInfo(cur);
    }
    setWhen(getWhenFromSettings());
  };

  useEffect(() => {
    // whenever opening the panel to edit, set controls to what is in the store.
    if (showStudentPay) {
      reset();
    }
  }, [showStudentPay]);

  useEffect(() => {
    // this makes it sync with any other editor when closed.
    if (!showStudentPay) {
      reset();
    }
  }, [settings.get("payInfo")]);

  const paySelected = useMemo(() => {
    if (!settings) return false;
    return settings.get("student_pay") || settings.get("institute_pay");
  }, [settings]);

  function getWhenFromSettings(): dayjs.Dayjs {
    const date = settings.get("pay");
    if (date) {
      return dayjs(date);
    } else {
      return dayjs().add(7, "day");
    }
  }

  function render_require_students_pay_desc() {
    if (when > dayjs()) {
      return (
        <span>
          <b>
            Your students will see a warning until <TimeAgo date={when} />.
          </b>{" "}
          {cost != null && (
            <>
              They will then be required to upgrade for a{" "}
              <b>one-time fee of {currency(cost)}</b>. This cost in USD is
              locked in, even if the rates on our site change.
            </>
          )}
        </span>
      );
    } else {
      return (
        <span>
          <b>
            Your students are required to upgrade their project now to use it.
          </b>{" "}
          If you want to give them more time to upgrade, move the date forward.
        </span>
      );
    }
  }

  function render_require_students_pay_when() {
    if (!settings.get("pay")) {
      return <span />;
    }

    return (
      <div style={{ marginBottom: "15px" }}>
        <div style={{ textAlign: "center", marginBottom: "15px" }}>
          <DatePicker
            allowClear={false}
            disabledDate={(current) => current < dayjs()}
            value={when}
            onChange={(date) => {
              setWhen(date ?? dayjs());
            }}
          />
        </div>
        {settings.get("pay") ? render_require_students_pay_desc() : undefined}
      </div>
    );
  }

  function render_students_pay_checkbox_label() {
    if (settings.get("pay")) {
      if (webapp_client.server_time() >= settings.get("pay")) {
        return <span>Require that students upgrade immediately:</span>;
      } else {
        return (
          <span>
            Require that students upgrade by <TimeAgo date={when} />:{" "}
          </span>
        );
      }
    } else {
      return <span>Require that students upgrade...</span>;
    }
  }

  function render_student_pay_desc() {
    if (settings.get("pay")) {
      return (
        <span>
          <span style={{ fontSize: "18pt" }}>
            <Icon name="check" />
          </span>{" "}
          <Gap />
          {render_require_students_pay_desc()}
        </span>
      );
    } else {
      return (
        <span>
          Require that all students in the course pay a one-time fee to upgrade
          their project. This is strongly recommended, and ensures that your
          students have a much better experience, and do not see a large{" "}
          <span
            style={{ color: "white", background: "darkred", padding: "0 5px" }}
          >
            RED warning banner
          </span>{" "}
          all the time. Alternatively, you (or your university) can pay for all
          students -- see below.
        </span>
      );
    }
  }

  if (settings == null || actions == null) {
    return <Spin />;
  }

  return (
    <Card
      style={!paySelected ? { background: "#fcf8e3" } : undefined}
      title={
        <>
          <Icon name="dashboard" /> Require Students to Upgrade (Students Pay)
        </>
      }
    >
      {cost != null && !showStudentPay && !!settings?.get("student_pay") && (
        <div style={{ float: "right" }}>
          <MoneyStatistic
            title="Cost Per Student"
            value={Math.max(minPayment ?? 0, cost)}
          />
        </div>
      )}
      <Checkbox
        checked={!!settings?.get("student_pay")}
        onChange={(e) => {
          actions.configuration.set_pay_choice("student", e.target.checked);
          if (e.target.checked) {
            setShowStudentPay(true);
            actions.configuration.setStudentPay({
              when: getWhenFromSettings(),
              info,
              cost,
            });
          }
        }}
      >
        Students pay directly
      </Checkbox>
      {settings?.get("student_pay") && (
        <div>
          <div style={{ margin: "15px 0" }}>
            <Button
              disabled={showStudentPay}
              onClick={() => {
                setShowStudentPay(true);
              }}
            >
              <Icon name="credit-card" /> Start and end dates and upgrades...
            </Button>
            {showStudentPay && (
              <div style={{ float: "right" }}>
                {" "}
                <Button
                  onClick={() => {
                    setShowStudentPay(false);
                    reset();
                  }}
                >
                  Cancel
                </Button>{" "}
                <Button
                  disabled={
                    isEqual(info, settings.get("payInfo")?.toJS()) &&
                    when.isSame(dayjs(settings.get("pay")))
                  }
                  type="primary"
                  onClick={() => {
                    actions.configuration.setStudentPay({ info, when, cost });
                    setShowStudentPay(false);
                  }}
                >
                  Save Changes
                </Button>
              </div>
            )}
          </div>
          {showStudentPay && (
            <Alert
              style={{ margin: "15px 0" }}
              message={
                <>
                  <Icon name="credit-card" /> Require Students to Upgrade their
                  Project
                </>
              }
              description={
                <div>
                  The cost is determined by the course length and desired
                  upgrades, which you configure below:
                  <div
                    style={{
                      height: "65px",
                      textAlign: "center",
                    }}
                  >
                    {cost != null && (
                      <MoneyStatistic
                        title="Cost"
                        value={Math.max(minPayment ?? 0, cost)}
                      />
                    )}
                  </div>
                  <Divider>Configuration</Divider>
                  <LicenseEditor
                    cellStyle={{ padding: 0, margin: "-10px 0" }}
                    info={info}
                    onChange={setInfo}
                    hiddenFields={new Set(["quantity", "custom_member"])}
                  />
                  <div style={{ margin: "15px 0" }}>
                    {render_students_pay_checkbox_label()}
                  </div>
                  {settings.get("pay")
                    ? render_require_students_pay_when()
                    : undefined}
                </div>
              }
            />
          )}
          <hr />
          <div style={{ color: "#666" }}>{render_student_pay_desc()}</div>
        </div>
      )}
    </Card>
  );
}
