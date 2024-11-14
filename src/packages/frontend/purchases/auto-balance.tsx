import {
  Alert,
  Button,
  Switch,
  Divider,
  Flex,
  Form,
  InputNumber,
  Modal,
  Progress,
  Space,
  Spin,
  Tooltip,
} from "antd";
import { useEffect, useState } from "react";
import { useTypedRedux } from "@cocalc/frontend/app-framework";
import { currency } from "@cocalc/util/misc";
import { webapp_client } from "@cocalc/frontend/webapp-client";
import ShowError from "@cocalc/frontend/components/error";
import { Icon } from "@cocalc/frontend/components/icon";
import { TimeAgo } from "@cocalc/frontend/components/time-ago";
import {
  AUTOBALANCE_RANGES,
  AUTOBALANCE_DEFAULTS,
  ensureAutoBalanceValid,
} from "@cocalc/util/db-schema/accounts";

interface Props {
  style?;
  type?;
}

export default function AutoBalance({ style, type }: Props) {
  const [open, setOpen] = useState<boolean>(false);
  const autoBalance = useTypedRedux("account", "auto_balance")?.toJS();

  let btn = (
    <Button type={type} style={style} onClick={() => setOpen(!open)}>
      {autoBalance?.enabled
        ? "Automatic Deposits: Enabled"
        : "Automatic Deposits: Disabled"}
    </Button>
  );
  if (autoBalance != null) {
    btn = (
      <Tooltip
        title={<Status autoBalance={autoBalance} />}
        color="white"
        overlayInnerStyle={{ width: "450px" }}
      >
        {btn}{" "}
      </Tooltip>
    );
  }

  return (
    <>
      {btn}
      {open && <AutoBalanceModal onClose={() => setOpen(false)} />}
    </>
  );
}

export function AutoBalanceModal({ onClose }) {
  const [saving, setSaving] = useState<boolean>(false);
  const [error, setError] = useState<string>("");
  const autoBalance = useTypedRedux("account", "auto_balance")?.toJS();
  const [value, setValue] = useState<{
    trigger: number;
    amount: number;
    max_day: number;
    max_week: number;
    max_month: number;
    enabled: boolean;
  } | null>(null);
  const [form] = Form.useForm();

  const setDefaults = (which: "min" | "max" | "default") => {
    let value;
    if (which == "default") {
      value = {
        trigger: AUTOBALANCE_DEFAULTS.trigger,
        amount: AUTOBALANCE_DEFAULTS.amount,
        max_day: AUTOBALANCE_DEFAULTS.max_day,
        max_week: AUTOBALANCE_DEFAULTS.max_week,
        max_month: AUTOBALANCE_DEFAULTS.max_month,
        enabled: AUTOBALANCE_DEFAULTS.enabled,
      };
    } else {
      const i = which == "min" ? 0 : 1;
      value = {
        trigger: AUTOBALANCE_RANGES.trigger[i],
        amount: AUTOBALANCE_RANGES.amount[i],
        max_day: AUTOBALANCE_RANGES.max_day[i],
        max_week: AUTOBALANCE_RANGES.max_week[i],
        max_month: AUTOBALANCE_RANGES.max_month[i],
        enabled: true,
      };
    }
    setValue(value);
    form.setFieldsValue(value);
  };

  useEffect(() => {
    setValue({
      trigger: autoBalance?.trigger ?? AUTOBALANCE_DEFAULTS.trigger,
      amount: autoBalance?.amount ?? AUTOBALANCE_DEFAULTS.amount,
      max_day: autoBalance?.max_day ?? AUTOBALANCE_DEFAULTS.max_day,
      max_week: autoBalance?.max_week ?? AUTOBALANCE_DEFAULTS.max_week,
      max_month: autoBalance?.max_month ?? AUTOBALANCE_DEFAULTS.max_month,
      enabled: autoBalance?.enabled ?? AUTOBALANCE_DEFAULTS.enabled,
    });
  }, [
    autoBalance?.trigger,
    autoBalance?.amount,
    autoBalance?.max_day,
    autoBalance?.max_week,
    autoBalance?.max_month,
    autoBalance?.enabled,
  ]);

  const changed =
    autoBalance?.trigger != value?.trigger ||
    autoBalance?.amount != value?.amount ||
    autoBalance?.max_day != value?.max_day ||
    autoBalance?.max_week != value?.max_week ||
    autoBalance?.max_month != value?.max_month ||
    !!autoBalance?.enabled != value?.enabled;

  const save = async () => {
    if (!changed) {
      return;
    }
    try {
      ensureAutoBalanceValid(value);
      setSaving(true);
      await webapp_client.async_query({
        query: { accounts: { auto_balance: value } },
      });
    } catch (err) {
      setError(`${err}`);
    } finally {
      setSaving(false);
    }
  };

  if (value == null) {
    return null;
  }

  return (
    <Modal
      width={600}
      open
      title={
        <>
          <Icon name="line-chart" /> Make Automatic Deposits
          {autoBalance?.trigger ? (
            <> to Keep Balance Above {currency(autoBalance.trigger)}</>
          ) : undefined}
        </>
      }
      onOk={() => {
        save();
        onClose();
      }}
      onCancel={onClose}
    >
      If you are using pay as you go features of CoCalc (e.g., compute servers,
      project upgrades, or large language models), you should configure your
      account so that money is deposited when your balance goes below a
      specified value.
      <Form
        form={form}
        name="basic"
        labelCol={{ span: 14 }}
        wrapperCol={{ span: 10 }}
        style={{ maxWidth: 500, marginTop: "30px" }}
        onValuesChange={(_, value) => setValue(value)}
        initialValues={value}
      >
        <Form.Item
          label=<Tooltip
            title={
              <>
                Every few minutes CoCalc will check if your balance is below{" "}
                {currency(value.trigger)}, and if so, try to make a deposit to
                bring the balance above this amount. If you have a payment that
                is not working, or you hit your limit, then no deposit will be
                attempted.
              </>
            }
          >
            Keep Balance Above
          </Tooltip>
          name="trigger"
        >
          <InputNumber addonBefore="$" />
        </Form.Item>
        <Form.Item
          label={
            <Tooltip
              title={
                <>
                  {currency(value.amount)} will typically be deposited when your
                  balance goes below {currency(value.trigger)}. More may be
                  deposited if the balance drops significantly lower, subject to
                  your limit.
                </>
              }
            >
              Add at Least
            </Tooltip>
          }
          name="amount"
        >
          <InputNumber addonBefore="$" />
        </Form.Item>
        <Form.Item
          label={
            <Tooltip
              title={
                <>
                  CoCalc will not deposit more than {currency(value.max_day)}{" "}
                  per day.
                </>
              }
            >
              Maximum amount to add per day
            </Tooltip>
          }
          name="max_day"
        >
          <InputNumber
            step={10}
            addonBefore="$"
            min={AUTOBALANCE_RANGES.max_day[0]}
            max={AUTOBALANCE_RANGES.max_day[1]}
          />
        </Form.Item>
        <Form.Item
          label={
            <Tooltip
              title={
                <>
                  CoCalc will not deposit more than {currency(value.max_week)}{" "}
                  per week.
                </>
              }
            >
              Maximum amount to add per week
            </Tooltip>
          }
          name="max_week"
        >
          <InputNumber
            step={25}
            addonBefore="$"
            min={AUTOBALANCE_RANGES.max_week[0]}
            max={AUTOBALANCE_RANGES.max_week[1]}
          />
        </Form.Item>
        <Form.Item
          label={
            <Tooltip
              title={
                <>
                  CoCalc will not deposit more than {currency(value.max_month)}{" "}
                  per month.
                </>
              }
            >
              Maximum amount to add per month
            </Tooltip>
          }
          name="max_month"
        >
          <InputNumber
            step={100}
            addonBefore="$"
            min={AUTOBALANCE_RANGES.max_month[0]}
            max={AUTOBALANCE_RANGES.max_month[1]}
          />
        </Form.Item>
        <Form.Item
          label="Enable automatic deposits"
          name="enabled"
          valuePropName="checked"
        >
          <Switch>Enabled</Switch>
        </Form.Item>
      </Form>
      <div style={{ textAlign: "center", marginBottom: "15px" }}>
        <Space>
          {/*<Button onClick={() => setDefaults("min")}>Min</Button> */}
          <Button onClick={() => setDefaults("default")}>Defaults</Button>
          {/* <Button onClick={() => setDefaults("max")}>Max</Button> */}
          <Button disabled={!changed || saving} onClick={save} type="primary">
            Save Changes{" "}
            {saving && <Spin delay={2000} style={{ marginLeft: "15px" }} />}
          </Button>
        </Space>
      </div>
      <ShowError error={error} setError={setError} />
      <Status autoBalance={autoBalance} style={{ marginTop: "15px" }} />
    </Modal>
  );
}

function Status({ autoBalance, style }: { autoBalance; style? }) {
  if (autoBalance == null) {
    return null;
  }
  return (
    <Alert
      style={style}
      showIcon
      type={autoBalance.enabled ? "warning" : "info"}
      message={
        <Flex>
          <div>
            Status: <b>{autoBalance.enabled ? " Enabled" : " NOT Enabled"}</b>
          </div>
          <div style={{ flex: 1 }} />
          <div>
            {!!autoBalance.time && (
              <>
                Updated <TimeAgo date={autoBalance.time} />
              </>
            )}
          </div>
        </Flex>
      }
      description={
        <div>
          <div style={{ marginBottom: "15px" }}>
            Strategy:{" "}
            <i>
              Keep balance above {currency(autoBalance.trigger)} by adding at
              least {currency(autoBalance.amount)}.
            </i>
          </div>
          <ProgressBars autoBalance={autoBalance} />
          <Divider />
          Last Action: {autoBalance.reason}
        </div>
      }
    />
  );
}

function ProgressBars({ autoBalance }) {
  if (autoBalance?.status == null) {
    return null;
  }
  const { day, week, month } = autoBalance.status;
  if (day == null || week == null || month == null) {
    return null;
  }
  return (
    <div>
      <Flex>
        <div style={{ width: "100px" }}>Day</div>
        <div style={{ width: "100px" }}>{currency(day ?? 0)}</div>
        {autoBalance?.max_day != null && (
          <Progress
            percent={Math.round((100 * (day ?? 0)) / autoBalance?.max_day)}
          />
        )}
      </Flex>
      <Flex>
        <div style={{ width: "100px" }}>Week</div>
        <div style={{ width: "100px" }}>{currency(week ?? 0)}</div>
        {autoBalance?.max_week != null && (
          <Progress
            percent={Math.round((100 * (week ?? 0)) / autoBalance?.max_week)}
          />
        )}
      </Flex>
      <Flex>
        <div style={{ width: "100px" }}>Month</div>
        <div style={{ width: "100px" }}>{currency(month ?? 0)}</div>
        {autoBalance?.max_month != null && (
          <Progress
            percent={Math.round((100 * (month ?? 0)) / autoBalance?.max_month)}
          />
        )}
      </Flex>
    </div>
  );
}
