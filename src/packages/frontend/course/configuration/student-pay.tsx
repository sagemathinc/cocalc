import {
  Alert,
  Button,
  Card,
  Checkbox,
  DatePicker,
  Divider,
  Space,
  Spin,
} from "antd";
import dayjs from "dayjs";
import { isEqual } from "lodash";
import { useEffect, useMemo, useState } from "react";
import { FormattedMessage, useIntl } from "react-intl";
import { Gap, Icon, TimeAgo } from "@cocalc/frontend/components";
import { labels } from "@cocalc/frontend/i18n";
import LicenseEditor from "@cocalc/frontend/purchases/license-editor";
import MoneyStatistic from "@cocalc/frontend/purchases/money-statistic";
import { webapp_client } from "@cocalc/frontend/webapp-client";
import { compute_cost } from "@cocalc/util/licenses/purchase/compute-cost";
import { DEFAULT_PURCHASE_INFO } from "@cocalc/util/licenses/purchase/student-pay";
import type { PurchaseInfo } from "@cocalc/util/licenses/purchase/types";
import { currency } from "@cocalc/util/misc";
import ShowError from "@cocalc/frontend/components/error";

export default function StudentPay({ actions, settings }) {
  const intl = useIntl();

  const [error, setError] = useState<string>("");
  const [minPayment, setMinPayment] = useState<number | undefined>(undefined);
  const updateMinPayment = () => {
    (async () => {
      setMinPayment(await webapp_client.purchases_client.getMinimumPayment());
    })();
  };
  useEffect(() => {
    updateMinPayment();
  }, []);

  const [info, setInfo] = useState<PurchaseInfo>(() => {
    let cur = settings.get("payInfo")?.toJS();
    let info: PurchaseInfo;
    if (cur != null) {
      info = { ...DEFAULT_PURCHASE_INFO, ...cur };
    } else {
      info = {
        ...DEFAULT_PURCHASE_INFO,
        // @ts-ignore
        start: new Date(),
        end: dayjs().add(3, "month").toDate(),
      };
    }
    setTimeout(() => {
      // React requirement: this must happen in different render loop, because
      // it causes an update to the UI.
      actions.configuration.setStudentPay({ info, cost });
    }, 1);
    console.log(info);
    return info;
  });

  if (info.type == "vouchers") {
    // for typescript
    throw Error("bug");
  }

  const getWhenFromSettings = () => {
    const pay = settings.get("pay");
    if (pay) {
      return dayjs(pay);
    }
    if (info.start) {
      return dayjs(info.start).add(7, "day");
    }
    return dayjs().add(7, "day");
  };

  const [when, setWhen] = useState<dayjs.Dayjs>(getWhenFromSettings);
  const cost = useMemo(() => {
    try {
      return compute_cost(info).cost;
    } catch (err) {
      setError(`${err}`);
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

  if (settings == null || actions == null) {
    return <Spin />;
  }

  const buttons = showStudentPay ? (
    <Space style={{ margin: "10px 0", float: "right" }}>
      <Button
        onClick={() => {
          setShowStudentPay(false);
          reset();
        }}
      >
        {intl.formatMessage(labels.cancel)}
      </Button>
      <Button
        disabled={
          isEqual(info, settings.get("payInfo")?.toJS()) &&
          when.isSame(dayjs(settings.get("pay")))
        }
        type="primary"
        onClick={() => {
          actions.configuration.setStudentPay({ info, when, cost });
        }}
      >
        {intl.formatMessage(labels.save_changes)}
      </Button>
    </Space>
  ) : undefined;

  return (
    <Card
      style={!paySelected ? { background: "#fcf8e3" } : undefined}
      title={
        <>
          <Icon name="dashboard" />{" "}
          <FormattedMessage
            id="course.student-pay.title"
            defaultMessage={"Require Students to Upgrade (Students Pay)"}
          />
        </>
      }
    >
      <ShowError error={error} setError={setError} />
      {cost != null && !showStudentPay && !!settings?.get("student_pay") && (
        <div style={{ float: "right" }}>
          <MoneyStatistic title="Cost Per Student" value={cost} />
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
            actions.configuration.configure_all_projects();
          }
        }}
      >
        <FormattedMessage
          id="course.student-pay.checkbox.students-pay"
          defaultMessage={"Students pay directly"}
        />
      </Checkbox>
      {settings?.get("student_pay") && (
        <div>
          {buttons}
          <Space style={{ margin: "10px 0" }}>
            <Button
              disabled={showStudentPay}
              onClick={() => {
                setShowStudentPay(true);
              }}
            >
              <Icon name="credit-card" /> Start and end dates and upgrades...
            </Button>
          </Space>
          <div>
            {showStudentPay && (
              <Alert
                style={{ margin: "15px 0" }}
                message={
                  <>
                    <Icon name="credit-card" /> Require Students to Upgrade
                    their Project
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
                        <MoneyStatistic title="Cost" value={cost} />
                      )}
                    </div>
                    <Divider>Configuration</Divider>
                    <LicenseEditor
                      noCancel
                      cellStyle={{ padding: 0, margin: "-10px 0" }}
                      info={info}
                      onChange={setInfo}
                      hiddenFields={new Set(["quantity", "custom_member"])}
                      minDiskGb={1}
                      minRamGb={2}
                    />
                    <div style={{ margin: "15px 0" }}>
                      <StudentPayCheckboxLabel
                        settings={settings}
                        when={when}
                      />
                    </div>
                    {!!settings.get("pay") && (
                      <RequireStudentsPayWhen
                        when={when}
                        setWhen={setWhen}
                        cost={cost}
                        minPayment={minPayment}
                        info={info}
                      />
                    )}
                    {buttons}
                  </div>
                }
              />
            )}
            <hr />
            <div style={{ color: "#666" }}>
              <StudentPayDesc
                settings={settings}
                when={when}
                cost={cost}
                minPayment={minPayment}
              />
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}

function StudentPayCheckboxLabel({ settings, when }) {
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

function RequireStudentsPayWhen({ when, setWhen, cost, minPayment, info }) {
  const start = dayjs(info.start);
  return (
    <div style={{ marginBottom: "15px" }}>
      <div style={{ textAlign: "center", marginBottom: "15px" }}>
        <DatePicker
          changeOnBlur
          showNow
          allowClear={false}
          disabledDate={(current) =>
            current < start.subtract(1, "day") ||
            current >= start.add(21, "day")
          }
          defaultValue={when}
          onChange={(date) => {
            setWhen(date ?? dayjs());
          }}
        />
      </div>
      <RequireStudentPayDesc cost={cost} when={when} minPayment={minPayment} />
    </div>
  );
}

function StudentPayDesc({ settings, cost, when, minPayment }) {
  if (settings.get("pay")) {
    return (
      <span>
        <span style={{ fontSize: "18pt" }}>
          <Icon name="check" />
        </span>{" "}
        <Gap />
        <RequireStudentPayDesc
          cost={cost}
          when={when}
          minPayment={minPayment}
        />
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

function RequireStudentPayDesc({ cost, when, minPayment }) {
  if (when > dayjs()) {
    return (
      <span>
        <b>
          Your students will see a warning until <TimeAgo date={when} />.
        </b>{" "}
        {cost != null && (
          <>
            They will then be required to upgrade for a{" "}
            <b>one-time fee of {currency(cost)}</b>. This cost in USD is locked
            in, even if the rates on our site change.{" "}
            {minPayment != null && cost < minPayment
              ? `NOTE: Students will have
               to pay ${currency(
                 minPayment,
               )} since that is the minimum transaction; they can use excess credit for other purchases.`
              : ""}
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
