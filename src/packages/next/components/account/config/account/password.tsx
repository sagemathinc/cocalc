/*
 *  This file is part of CoCalc: Copyright © 2021 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Alert, Button, Input, Space } from "antd";
import { useState } from "react";

import { MIN_PASSWORD_LENGTH } from "@cocalc/util/auth";
import { Paragraph, Text, Title } from "components/misc";
import A from "components/misc/A";
import Loading from "components/share/loading";
import apiPost from "lib/api/post";
import register from "../register";

register({
  path: "account/password",
  title: "Password",
  icon: "user-secret",
  desc: "Change or reset your password.",
  Component: () => {
    const [currentPassword, setCurrentPassword] = useState<string>("");
    const [newPassword, setNewPassword] = useState<string>("");
    const [changing, setChanging] = useState<boolean>(false);
    const [changed, setChanged] = useState<string>("");
    const [error, setError] = useState<string>("");

    async function resetPassword() {
      setError("");
      setChanging(true);
      setChanged("");
      try {
        await apiPost("/accounts/set-password", {
          currentPassword,
          newPassword,
        });
        setChanged(newPassword);
      } catch (err) {
        setError(err.message);
      } finally {
        setChanging(false);
      }
    }

    return (
      <Space direction="vertical">
        <Title level={3}>Change Password</Title>
        {error && (
          <Alert
            type="error"
            message={
              <>
                {error} <A href="/auth/password-reset">Reset password...</A>
              </>
            }
            showIcon
          />
        )}
        <Paragraph>
          <Text strong>Current password:</Text>
          <Input.Password
            disabled={changing}
            placeholder="Current password..."
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
          />
          (leave blank if you have not set a password)
        </Paragraph>
        <Paragraph>
          <Text strong>New password:</Text>
          <Input.Password
            disabled={changing}
            placeholder="New password..."
            value={newPassword}
            onChange={(e) => {
              setNewPassword(e.target.value);
            }}
            onPressEnter={resetPassword}
          />
          (at least {MIN_PASSWORD_LENGTH} characters)
        </Paragraph>
        <Button
          type="primary"
          disabled={
            (changed && changed == newPassword) ||
            changing ||
            newPassword.length < MIN_PASSWORD_LENGTH ||
            newPassword == currentPassword
          }
          onClick={resetPassword}
        >
          {changing ? (
            <Loading delay={0}>Changing Password</Loading>
          ) : (
            "Change Password"
          )}
        </Button>
        {changed && changed == newPassword && (
          <Alert
            type="success"
            message={"Password successfully changed!"}
            showIcon
          />
        )}
        <br />
        <Title level={3}>Reset Password</Title>
        <Paragraph>
          You can also <A href="/auth/password-reset">reset your password</A>,
          in case you don't remember it.
        </Paragraph>
      </Space>
    );
  },
});
