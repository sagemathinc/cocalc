import {
  Alert,
  Button,
  Card,
  Checkbox,
  DatePicker,
  Spin,
  Statistic,
} from "antd";
import { useEffect, useMemo, useState } from "react";
import { webapp_client } from "@cocalc/frontend/webapp-client";
import { Gap, Icon, TimeAgo } from "@cocalc/frontend/components";
import { days_ago } from "@cocalc/util/misc";
import LicenseEditor from "@cocalc/frontend/purchases/license-editor";
import { currency } from "@cocalc/frontend/purchases/util";
import type { PurchaseInfo } from "@cocalc/util/licenses/purchase/types";
import { compute_cost } from "@cocalc/util/licenses/purchase/compute-cost";
import MoneyStatistic from "@cocalc/frontend/purchases/money-statistic";
import dayjs from "dayjs";

const DEFAULT_PURCHASE_INFO = {
  type: "quota",
  user: "academic",
  upgrade: "custom",
  quantity: 1,
  subscription: "no",
  custom_cpu: 1,
  custom_dedicated_cpu: 0,
  custom_ram: 2,
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
  const [info, setInfo] = useState<PurchaseInfo>({
    ...(DEFAULT_PURCHASE_INFO as PurchaseInfo),
    start: dayjs(),
  });
  const cost = useMemo(() => {
    try {
      return compute_cost(info).discounted_cost;
    } catch (_) {
      return null;
    }
  }, [info]);
  const [showStudentPay, setShowStudentPay] = useState<boolean>(false);
  const paySelected = useMemo(() => {
    if (!settings) return false;
    return settings.get("student_pay") || settings.get("institute_pay");
  }, [settings]);

  function get_student_pay_when(): Date | string {
    const date = settings.get("pay");
    if (date) {
      return date;
    } else {
      return days_ago(-7);
    }
  }

  function handle_student_pay_button(): void {
    setShowStudentPay(true);
  }

  function handle_student_pay_choice(e): void {
    actions.configuration.set_pay_choice("student", e.target.checked);
    if (e.target.checked) {
      setShowStudentPay(true);
      actions.configuration.set_course_info(get_student_pay_when());
    }
  }

  function render_require_students_pay_desc() {
    const date = new Date(settings.get("pay"));
    if (date > webapp_client.server_time()) {
      return (
        <span>
          <b>
            Your students will see a warning until <TimeAgo date={date} />;
            after that they will be required to upgrade.
          </b>{" "}
          {cost != null && (
            <>
              They will then be required to upgrade for a special discounted
              one-time fee of {currency(cost)}.
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
            disabledDate={(current) => current < dayjs()}
            value={dayjs(settings.get("pay"))}
            onChange={(date) => {
              actions.configuration.set_course_info(
                date != null ? date.toDate().toISOString() : undefined
              );
            }}
          />
        </div>
        {settings.get("pay") ? render_require_students_pay_desc() : undefined}
      </div>
    );
  }

  function handle_students_pay_checkbox(e): void {
    if (e.target.checked) {
      actions.configuration.set_course_info(get_student_pay_when());
    } else {
      actions.configuration.set_course_info("");
    }
  }

  function render_students_pay_checkbox_label() {
    if (settings.get("pay")) {
      if (webapp_client.server_time() >= settings.get("pay")) {
        return <span>Require that students upgrade immediately:</span>;
      } else {
        return (
          <span>
            Require that students upgrade by{" "}
            <TimeAgo date={settings.get("pay")} />:{" "}
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
          <Icon name="dashboard" /> Require Students to Upgrade (students pay)
        </>
      }
    >
      <Checkbox
        checked={!!(settings != null ? settings.get("student_pay") : undefined)}
        onChange={handle_student_pay_choice}
      >
        Students will pay for this course
      </Checkbox>
      {settings?.get("student_pay") && (
        <div>
          {showStudentPay ? (
            <Alert
              style={{ margin: "15px 0" }}
              message={
                <div>
                  <h3>
                    <Icon name="arrow-circle-up" /> Require Students to Upgrade
                    their Project
                  </h3>
                  <hr />
                  <div
                    style={{
                      height: "65px",
                      textAlign: "center",
                      fontSize: "12pt",
                      marginTop: "-15px",
                    }}
                  >
                    {cost != null && (
                      <MoneyStatistic
                        title="Student Cost"
                        value={Math.max(minPayment, cost)}
                      />
                    )}
                  </div>
                  <LicenseEditor
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
                  <Button onClick={() => setShowStudentPay(false)}>
                    Close
                  </Button>
                </div>
              }
            />
          ) : (
            <div style={{ textAlign: "center", margin: "15px 0" }}>
              <Button type="primary" onClick={handle_student_pay_button}>
                <Icon name="arrow-circle-up" /> Configure how students will
                pay...
              </Button>
            </div>
          )}
          <hr />
          <div style={{ color: "#666" }}>{render_student_pay_desc()}</div>
        </div>
      )}
    </Card>
  );
}
