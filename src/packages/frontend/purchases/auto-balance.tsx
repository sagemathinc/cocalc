import {
  Alert,
  Button,
  Checkbox,
  Divider,
  Flex,
  Form,
  InputNumber,
  Modal,
  Progress,
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
  //ensureAutoBalanceValid,
} from "@cocalc/util/db-schema/accounts";

interface Props {
  style?;
  type?;
}

export default function AutoBalance({ style, type }: Props) {
  const [open, setOpen] = useState<boolean>(false);
  const autoBalance = useTypedRedux("account", "auto_balance")?.toJS();
  return (
    <>
      <Tooltip
        title={<Status autoBalance={autoBalance} />}
        color="white"
        overlayInnerStyle={{ width: "400px" }}
      >
        <Button type={type} style={style} onClick={() => setOpen(!open)}>
          {autoBalance?.enabled
            ? "Automatic Deposits: Enabled"
            : "Setup Automatic Deposits"}
        </Button>
      </Tooltip>
      {open && <AutoBalanceModal onClose={() => setOpen(false)} />}
    </>
  );
}

function AutoBalanceModal({ onClose }) {
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

  useEffect(() => {
    console.log("autoBalance changed", autoBalance);
    setValue({
      trigger: autoBalance?.trigger ?? AUTOBALANCE_RANGES.trigger[0],
      amount: autoBalance?.amount ?? AUTOBALANCE_RANGES.amount[0],
      max_day: autoBalance?.max_day ?? AUTOBALANCE_RANGES.max_day[0],
      max_week: autoBalance?.max_week ?? AUTOBALANCE_RANGES.max_week[0],
      max_month: autoBalance?.max_month ?? AUTOBALANCE_RANGES.max_month[0],
      enabled: autoBalance?.enabled ?? false,
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

  if (autoBalance == null || value == null) {
    return null;
  }

  return (
    <Modal
      width={600}
      open
      title={
        <>
          <Icon name="line-chart" /> Automatically Add Credit When Balance is
          Low
        </>
      }
      onOk={onClose}
      onCancel={onClose}
    >
      If you are using pay as you go features of CoCalc (e.g., compute servers,
      project upgrades, or large language models), you can configure your
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
                is not working, or you hit any of the daily, weekly or monthly
                limits, then no deposit will be attempted.
              </>
            }
          >
            Add credit when balance goes below
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
                  deposited if the balance drops significantly lower, subject
                  to your daily, weekly and monthly limits.
                </>
              }
            >
              Amount to add
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
                  per 24 hour period.
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
                  per 7 day period.
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
                  per month (30.5 days).
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
          <Checkbox>Enabled</Checkbox>
        </Form.Item>
      </Form>
      <div style={{ textAlign: "center", marginBottom: "15px" }}>
        <Button disabled={!changed || saving} onClick={save} type="primary">
          Save Changes {saving && <Spin style={{ marginLeft: "15px" }} />}
        </Button>
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
        <>
          Status: <b>{autoBalance.enabled ? " Enabled" : " NOT Enabled"}</b>
        </>
      }
      description={
        <div>
          <ProgressBars autoBalance={autoBalance} />
          <Divider />
          {!!autoBalance.reason && (
            <>
              {autoBalance.time ? (
                <TimeAgo date={autoBalance.time} />
              ) : (
                "Last Update"
              )}
              : {autoBalance.reason}
            </>
          )}
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
        {autoBalance?.max_day != null && (
          <Progress
            percent={(100 * (day ?? 0)) / autoBalance?.max_day}
            format={() => currency(day)}
          />
        )}
      </Flex>
      <Flex>
        <div style={{ width: "100px" }}>Week</div>
        {autoBalance?.max_week != null && (
          <Progress
            percent={(100 * (week ?? 0)) / autoBalance?.max_week}
            format={() => currency(week)}
          />
        )}
      </Flex>
      <Flex>
        <div style={{ width: "100px" }}>Month</div>
        {autoBalance?.max_month != null && (
          <Progress
            percent={(100 * (month ?? 0)) / autoBalance?.max_month}
            format={() => currency(month)}
          />
        )}
      </Flex>
    </div>
  );
}
