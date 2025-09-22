/*
 *  This file is part of CoCalc: Copyright © 2021 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Alert, Button, Input, Popconfirm, Space } from "antd";
import { useState } from "react";

import Loading from "components/share/loading";
import apiPost from "lib/api/post";
import useAPI from "lib/hooks/api";
import register from "../register";
import { Paragraph, Text } from "components/misc";
import ApiKeys from "@cocalc/frontend/components/api-keys";
import { MIN_PASSWORD_LENGTH } from "@cocalc/util/auth";

register({
  path: "account/api",
  title: "API Keys",
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
    const newConfig = (
      <div style={{ marginBottom: "15px" }}>
        <ApiKeys
          manage={async (opts) => {
            const { response } = await apiPost("api-keys", opts);
            return response;
          }}
        />
        <p>
          You can also make project specific api keys in any project's settings.
          If you only need to use the API to access one project, these are
          safer.
        </p>
      </div>
    );

    if (result.hasPassword && !validPassword) {
      return (
        <Space direction="vertical">
          {newConfig}
          <div>
            {apiError && <Alert type="error" message={apiError} showIcon />}
            <Input.Password
              value={password}
              style={{ maxWidth: "50ex" }}
              placeholder="Enter your password..."
              onChange={(e) => setPassword(e.target.value)}
               onPressEnter={() => {
                 if (password.length >= MIN_PASSWORD_LENGTH) {
                   submitPassword(password);
                 }
               }}
            />
             <Button
               style={{ marginLeft: "15px" }}
               disabled={password.length < MIN_PASSWORD_LENGTH}
               onClick={() => submitPassword(password)}
             >
              Show Older Legacy API Key
            </Button>
          </div>
        </Space>
      );
    }

    if (!result.hasPassword && !showApi) {
      return (
        <div>
          {newConfig}
          <Button
            type="primary"
            onClick={() => {
              setShowApi(true);
              apiAction("get");
            }}
          >
            Show Older Legacy API Key
          </Button>
        </div>
      );
    }

    let body;
    if (apiKey) {
      body = (
        <Space direction="vertical">
          {newConfig}
          API Key (old legacy key -- use above instead and delete this if you
          can):
          <Text code strong style={{ fontSize: "150%" }} copyable>
            {apiKey}
          </Text>
          <Popconfirm
            title={
              <>
                <Paragraph style={{ maxWidth: "50ex" }}>
                  Are you sure you want to delete your API key?
                </Paragraph>
                <Paragraph type="danger">
                  Anything using the current API key will stop working until you
                  create and enter a new key.
                </Paragraph>
              </>
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
      body = <Space direction="vertical">{newConfig}</Space>;
    }

    return (
      <Space direction="vertical" style={{ width: "100%" }}>
        {apiError && <Alert type="error" message={apiError} showIcon />}
        {body}
      </Space>
    );
  },
});
