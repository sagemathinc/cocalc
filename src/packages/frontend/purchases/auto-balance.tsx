import { Alert, Button, Checkbox, InputNumber, Modal, Space } from "antd";
import { useEffect, useState } from "react";
import { useTypedRedux } from "@cocalc/frontend/app-framework";

import {
  AUTOBALANCE_RANGES,
  //ensureAutoBalanceValid,
} from "@cocalc/util/db-schema/accounts";

export default function AutoBalance({}) {
  const [open, setOpen] = useState<boolean>(false);
  return (
    <>
      <Button onClick={() => setOpen(!open)}>Automatic Deposits</Button>
      {open && <AutoBalanceModal onClose={() => setOpen(false)} />}
    </>
  );
}

function AutoBalanceModal({ onClose }) {
  const autoBalance = useTypedRedux("account", "auto_balance")?.toJS();
  const [trigger, setTrigger] = useState<number | null>(null);
  const [amount, setAmount] = useState<number | null>(null);
  const [maxDay, setMaxDay] = useState<number | null>(null);
  const [maxWeek, setMaxWeek] = useState<number | null>(null);
  const [maxMonth, setMaxMonth] = useState<number | null>(null);
  const [enabled, setEnabled] = useState<boolean>(false);

  useEffect(() => {
    setTrigger(autoBalance?.trigger ?? AUTOBALANCE_RANGES.trigger[0]);
    setAmount(autoBalance?.amount ?? AUTOBALANCE_RANGES.amount[0]);
    setMaxDay(autoBalance?.max_day ?? AUTOBALANCE_RANGES.max_day[0]);
    setMaxWeek(autoBalance?.max_week ?? AUTOBALANCE_RANGES.max_week[0]);
    setMaxMonth(autoBalance?.max_month ?? AUTOBALANCE_RANGES.max_month[0]);
    setEnabled(autoBalance?.enabled ?? false);
  }, [autoBalance]);

  const changed =
    autoBalance?.trigger != trigger ||
    autoBalance?.amount != amount ||
    autoBalance?.max_day != maxDay ||
    autoBalance?.max_week != maxWeek ||
    autoBalance?.max_month != maxMonth ||
    !!autoBalance?.enabled != enabled;

  const save = async () => {
    if (!changed) {
      return;
    }
    console.log("TODO");
  };

  if (autoBalance == null) {
    return null;
  }

  return (
    <Modal
      width={600}
      open
      title={<>Automatically Add Credit When Balance Gets Low</>}
      onOk={onClose}
      onCancel={onClose}
    >
      <Space direction="vertical">
        <InputNumber value={trigger} onChange={(value) => setTrigger(value)} />
        <InputNumber value={amount} onChange={(value) => setAmount(value)} />
        <InputNumber value={maxDay} onChange={(value) => setMaxDay(value)} />
        <InputNumber value={maxWeek} onChange={(value) => setMaxWeek(value)} />
        <InputNumber
          value={maxMonth}
          onChange={(value) => setMaxMonth(value)}
        />
        <Checkbox
          checked={enabled}
          onChange={(e) => setEnabled(e.target.checked)}
        >
          Enabled
        </Checkbox>
        <Button disabled={!changed} onClick={save}>
          Save
        </Button>
        {!!autoBalance?.reason && (
          <Alert
            type="info"
            message={"Status"}
            description={autoBalance.reason}
          />
        )}
        {autoBalance?.status != null && <Status autoBalance={autoBalance} />}
      </Space>
    </Modal>
  );
}

function Status({ autoBalance }) {
  if (autoBalance?.status == null) {
    return null;
  }
  return <pre>{JSON.stringify(autoBalance.status)}</pre>;
}
