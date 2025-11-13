import { Alert, Button, InputNumber, Space, Spin } from "antd";
import { useState } from "react";
import { Icon } from "@cocalc/frontend/components";
import { webapp_client } from "@cocalc/frontend/webapp-client";
import { currency } from "@cocalc/util/misc";

export default function PayAsYouGoMinBalance({ account_id }) {
  const [minBalance, setMinBalance] = useState<number | null>(null);
  const [lastSaved, setLastSaved] = useState<number | null>(null);
  const [loading, setLoading] = useState<boolean>(false);

  const getMinBalance = async () => {
    try {
      setLoading(true);
      const minBalance =
        await webapp_client.purchases_client.adminGetMinBalance(account_id);
      setMinBalance(minBalance);
      setLastSaved(minBalance);
    } finally {
      setLoading(false);
    }
  };

  const saveMinBalance = async (minBalance: number) => {
    await webapp_client.purchases_client.adminSetMinBalance(
      account_id,
      minBalance,
    );
    setLastSaved(minBalance);
    setTimeout(getMinBalance, 5000); // minBalance is cached so just do this soon...
  };

  return (
    <div>
      <Button
        type={lastSaved != null ? "dashed" : undefined}
        onClick={() => {
          if (minBalance == null || lastSaved == null) {
            getMinBalance();
          } else {
            setMinBalance(null);
            setLastSaved(null);
          }
        }}
      >
        <Icon name="credit-card" /> Minimum Allowed Balance{" "}
        {loading && <Spin delay={500} />}
      </Button>
      {lastSaved != null && (
        <Alert
          style={{ marginTop: "15px", maxWidth: "800px" }}
          type="warning"
          closable
          onClose={() => {
            setMinBalance(null);
            setLastSaved(null);
          }}
          message={
            <div>
              <span>Current Minimum Allowed Balance: </span>
              <span>{currency(lastSaved)}</span>
            </div>
          }
          description={
            <div>
              <div>
                The smaller this is, the more credit we are extending to this
                customer.
              </div>
              <Space style={{ marginTop: "5px" }}>
                <InputNumber
                  step={10}
                  defaultValue={minBalance ?? undefined}
                  onChange={(val) => setMinBalance(val)}
                />
                <Button
                  type="primary"
                  disabled={minBalance == lastSaved || minBalance == null}
                  onClick={() => {
                    if (minBalance != null) {
                      saveMinBalance(minBalance);
                    }
                  }}
                >
                  <Icon name="save" /> Save
                </Button>
              </Space>
              {(minBalance ?? 0) > 0 && (
                <Alert
                  style={{ marginTop: "15px" }}
                  showIcon
                  type="info"
                  description={
                    <>
                      This is a <b>POSITIVE</b> value, which means that the user
                      has to maintain at least that balance to make any
                      purchases. This might be for users we don't trust, but we
                      haven't decided to ban them. This is also useful for
                      testing, to force a purchase requirement without having to
                      zero out your balance.
                    </>
                  }
                />
              )}
              {(minBalance ?? 0) < 0 && (
                <Alert
                  style={{ marginTop: "15px" }}
                  showIcon
                  type="info"
                  description={
                    <>
                      This is a <b>NEGATIVE</b> value, which means that the user
                      ONLY has to maintain at least that balance to make any
                      purchases. This is for users we trust more than the
                      default.
                    </>
                  }
                />
              )}
            </div>
          }
        />
      )}
    </div>
  );
}
