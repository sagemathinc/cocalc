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
      minBalance
    );
    setLastSaved(minBalance);
    setTimeout(getMinBalance, 5000); // minBalance is cached so just do this soon...
  };

  return (
    <div>
      <Button
        onClick={() => {
          if (minBalance == null || lastSaved == null) {
            getMinBalance();
          } else {
            setMinBalance(null);
            setLastSaved(null);
          }
        }}
      >
        <Icon name="credit-card" /> Minimum Allowed Balance...{" "}
        {loading && <Spin delay={500} />}
      </Button>
      {lastSaved != null && (
        <Alert
          style={{ marginTop: "15px", maxWidth: "600px" }}
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
                  max={0}
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
            </div>
          }
        />
      )}
    </div>
  );
}
