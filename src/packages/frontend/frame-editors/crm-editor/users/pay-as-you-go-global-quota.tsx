import { Alert, Button, InputNumber, Space } from "antd";
import { useState } from "react";
import { Icon } from "@cocalc/frontend/components";
import { webapp_client } from "@cocalc/frontend/webapp-client";

export default function PayAsYouGoGlobalQuota({ account_id }) {
  const [quota, setQuota] = useState<{ quota: number; why: string } | null>(
    null
  );
  const [lastSaved, setLastSaved] = useState<number | null>(null);

  const getQuota = async () => {
    const q = await webapp_client.purchases_client.adminGetQuota(account_id);
    setQuota(q);
    setLastSaved(q.quota);
  };

  const saveQuota = async (quota: number) => {
    await webapp_client.purchases_client.adminSetQuota(account_id, quota);
    setLastSaved(quota);
    setTimeout(getQuota, 5000); // quota is cached so just do this soon...
  };

  return (
    <div>
      <Button
        onClick={() => {
          if (quota == null) {
            getQuota();
          } else {
            setQuota(null);
          }
        }}
      >
        <Icon name="credit-card" /> Global Spending Limit...
      </Button>
      {quota != null && (
        <Alert
          style={{ marginTop: "15px" }}
          type="warning"
          closable
          onClose={() => setQuota(null)}
          description={
            <div>
              <div>
                <span>Current Quota: </span>
                <span>
                  ${quota.quota} {quota.why ? ` - ${quota.why}` : ""}
                </span>
              </div>
              <Space style={{ marginTop: "5px" }}>
                <span>Update Quota: </span>
                <InputNumber
                  defaultValue={quota.quota}
                  onChange={(val) =>
                    setQuota(
                      (prev) =>
                        ({
                          ...prev,
                          quota: val,
                        } as any)
                    )
                  }
                />
                <Button
                  disabled={quota.quota == lastSaved}
                  onClick={() => saveQuota(quota.quota)}
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
