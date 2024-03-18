import { useEffect } from "react";
import generateVouchers from "@cocalc/util/vouchers";
import { Button, Input, Popconfirm } from "antd";
import { Icon } from "@cocalc/frontend/components/icon";

function createToken() {
  return generateVouchers({ count: 1, length: 16 })[0];
}

export default function AuthToken({ setConfig, configuration, state, IMAGES }) {
  const { proxy, authToken } = IMAGES[configuration.image] ?? {};
  const noAuthToken = proxy === false && !authToken;
  useEffect(() => {
    if (noAuthToken) {
      return;
    }
    // create token if it is not set but required
    if (configuration.authToken == null) {
      setConfig({ authToken: createToken() });
    }
  }, [noAuthToken, configuration.authToken]);

  if (noAuthToken) {
    // image that doesn't use authToken in any ways
    return null;
  }

  return (
    <div style={{ color: "#666" }}>
      <div style={{ marginTop: "15px", display: "flex" }}>
        <div style={{ margin: "auto 30px auto 0" }}>
          <b>Auth Token:</b>
        </div>
        <Input.Password
          style={{ width: "200px" }}
          readOnly
          value={configuration.authToken ?? ""}
        />
        <Popconfirm
          onConfirm={() => {
            setConfig({ authToken: createToken() });
          }}
          okText="Change token"
          title={"Change auth token?"}
          description={
            <div style={{ width: "400px" }}>
              <b>
                WARNING: Changing the auth token will prevent people who you
                shared the old token with from using the site.
              </b>
            </div>
          }
        >
          <Button
            style={{ marginLeft: "30px" }}
            disabled={
              authToken &&
              state != "deprovisioned" &&
              state != "off" /* will get rid of soon  */
            }
          >
            <Icon name="refresh" />
            Randomize...
          </Button>
        </Popconfirm>
      </div>
    </div>
  );
}
