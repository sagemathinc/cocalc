import { useState } from "react";

import register from "../register";
import { Alert, Button, Input, Popconfirm, Space } from "antd";
import useAPI from "lib/hooks/api";
import Loading from "components/share/loading";
import apiPost from "lib/api/post";
import A from "components/misc/A";

register({
  path: "account/api",
  title: "API Key",
  icon: "key",
  desc: "View, create, remove or regenerate the API key for accessing your account.  If you want API access only to a specific list of projects, create a new CoCalc account, add that account as a collaborator to those projects, and create an API key for that account.",
  Component: () => {
    const [validPassword, setValidPassword] = useState<string>("");
    const [password, setPassword] = useState<string>("");
    const { result, error } = useAPI("auth/has-password");
    const [apiError, setApiError] = useState<string>("");
    const [apiKey, setApiKey] = useState<string>("");
    const [showApi, setShowApi] = useState<boolean>(false);
    const [loading, setLoading] = useState<boolean>(false);
    if (!result) return <Loading />;
    if (error) {
      // e.g., not signed in or database down...
      return <Alert type="error" message={error} showIcon />;
    }

    if (loading) {
      return <Loading />;
    }

    async function submitPassword(password) {
      try {
        setLoading(true);
        setApiError("");
        const { api_key } = await apiPost("api-key", {
          action: "get",
          password,
        });
        setValidPassword(password);
        setApiKey(api_key);
      } catch (err) {
        setApiError(err.message);
      } finally {
        setLoading(false);
      }
    }

    async function apiAction(action: "get" | "delete" | "regenerate") {
      try {
        setLoading(true);
        setApiError("");
        const { api_key } = await apiPost("api-key", {
          action,
          password: validPassword,
        });
        setApiKey(api_key);
      } catch (err) {
        setApiError(err.message);
      } finally {
        setLoading(false);
      }
    }

    if (result.hasPassword && !validPassword) {
      return (
        <Space direction="vertical">
          {apiError && <Alert type="error" message={apiError} showIcon />}
          <Input.Password
            value={password}
            style={{ maxWidth: "50ex" }}
            placeholder="Enter your password..."
            onChange={(e) => setPassword(e.target.value)}
            onPressEnter={() => {
              if (password.length >= 6) {
                submitPassword(password);
              }
            }}
          />
          <Button
            disabled={password.length < 6}
            type="primary"
            onClick={() => submitPassword(password)}
          >
            Show API Key
          </Button>
        </Space>
      );
    }
    if (!result.hasPassword && !showApi) {
      return (
        <Button
          type="primary"
          onClick={() => {
            setShowApi(true);
            apiAction("get");
          }}
        >
          Show API Key
        </Button>
      );
    }

    let body;
    if (apiKey) {
      body = (
        <Space direction="vertical">
          API Key:
          <Input value={apiKey} readOnly style={{ width: "60ex" }} />
          <br />
          <A href="https://doc.cocalc.com/api/">Learn about the API...</A>
          <br />
          <Popconfirm
            title={
              <div style={{ maxWidth: "50ex" }}>
                Are you sure you want to delete your API key?{" "}
                <b>
                  <i>
                    Anything using the current API key will stop working until
                    you create and enter a new key.
                  </i>
                </b>
              </div>
            }
            onConfirm={() => apiAction("delete")}
            okText={"Yes, delete my key"}
            cancelText={"Cancel"}
          >
            <Button danger>Delete API Key</Button>
          </Popconfirm>
        </Space>
      );
    } else {
      body = (
        <Space direction="vertical">
          You do not have an API key.
          <Button onClick={() => apiAction("regenerate")}>
            Create API Key
          </Button>
        </Space>
      );
    }

    return (
      <Space direction="vertical" style={{ width: "100%" }}>
        {apiError && <Alert type="error" message={apiError} showIcon />}
        {body}
      </Space>
    );
  },
});
