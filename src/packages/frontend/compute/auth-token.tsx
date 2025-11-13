import { useEffect, useState } from "react";
import generateVouchers from "@cocalc/util/vouchers";
import { Button, Input, Popconfirm, Spin } from "antd";
import { Icon } from "@cocalc/frontend/components/icon";
import { PROXY_AUTH_TOKEN_FILE } from "@cocalc/util/compute/constants";
import { writeTextFileToComputeServer } from "./project";
import ShowError from "@cocalc/frontend/components/error";

function createToken() {
  return generateVouchers({ count: 1, length: 16 })[0];
}

export default function AuthToken({
  id,
  project_id,
  setConfig,
  configuration,
  state,
  IMAGES,
}) {
  const [error, setError] = useState<string>("");
  const [saving, setSaving] = useState<boolean>(false);
  const { proxy, authToken } = IMAGES?.[configuration.image] ?? {};
  const noAuthToken = proxy === false && !authToken;

  const updateAuthToken = async () => {
    const authToken = createToken();
    try {
      setSaving(true);
      setError("");
      await setConfig({ authToken });
      if (id && state == "running") {
        // also attempt to write it directly to the file system, which updates
        // the proxy server in realtime to use the new token.
        await writeAuthToken({
          compute_server_id: id,
          project_id,
          authToken,
        });
      }
    } catch (err) {
      setError(`${err}`);
    } finally {
      setSaving(false);
    }
  };
  useEffect(() => {
    if (noAuthToken) {
      return;
    }
    // create token if it is not set but required
    if (configuration.authToken == null) {
      updateAuthToken();
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
        <ShowError
          error={error}
          setError={setError}
          style={{ margin: "15px 0" }}
        />
        <Input.Password
          style={{ width: "200px" }}
          readOnly
          value={configuration.authToken ?? ""}
        />
        <Popconfirm
          onConfirm={updateAuthToken}
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
              saving ||
              (authToken &&
                state != "deprovisioned" &&
                state != "off") /* will get rid of soon  */
            }
          >
            <Icon name="refresh" />
            Randomize...
            {saving && <Spin />}
          </Button>
        </Popconfirm>
      </div>
    </div>
  );
}

async function writeAuthToken({ authToken, project_id, compute_server_id }) {
  await writeTextFileToComputeServer({
    value: authToken,
    project_id,
    compute_server_id,
    sudo: true,
    path: PROXY_AUTH_TOKEN_FILE,
  });
}
