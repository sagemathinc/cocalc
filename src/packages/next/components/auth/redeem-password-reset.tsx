/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Alert, Button, Input } from "antd";
import { useState } from "react";
import { useRouter } from "next/router";

import useCustomize from "lib/use-customize";
import A from "components/misc/A";
import apiPost from "lib/api/post";
import { Icon } from "@cocalc/frontend/components/icon";
import Contact from "components/landing/contact";

import AuthPageContainer from "./fragments/auth-page-container";

export default function PasswordReset({ passwordResetId }) {
  const { siteName } = useCustomize();
  const [password, setPassword] = useState<string>("");
  const [resetting, setResetting] = useState<boolean>(false);
  const [error, setError] = useState<string>("");
  const [success, setSuccess] = useState<string>("");
  const router = useRouter();

  async function resetPassword() {
    if (resetting) return;
    try {
      setError("");
      setSuccess("");
      setResetting(true);
      await apiPost("/auth/redeem-password-reset", {
        password,
        passwordResetId,
      });
      // if no error got signed in, so go to success page.
      router.push("/auth/password-reset-done");
    } catch (err) {
      setError(`${err}`);
    } finally {
      setResetting(false);
    }
  }

  function renderFooter() {
    return (
      <>
        <p>
          Remember your password? <A href="/auth/sign-in">Sign In</A>
        </p>
        You can also{" "}
        <A href="/auth/try">use {siteName} without creating an account</A>
      </>
    );
  }

  function renderError() {
    return error && (
      <div style={{ fontSize: "12pt" }}>
        <b>{error}</b>
        <br/> If you are stuck, please <Contact lower/>.
      </div>
    );
  }

  return (
    <AuthPageContainer
      error={renderError()}
      footer={renderFooter()}
      title={`Reset Your ${siteName} Password`}
    >
      <div style={{ margin: "10px 0" }}>
        Choose a new {siteName} password:
      </div>
      <form>
        <Input.Password
          style={{ fontSize: "13pt" }}
          autoFocus
          placeholder="New Password"
          autoComplete="username"
          value={password}
          onChange={(e) => {
            setPassword(e.target.value);
            setError("");
            setSuccess("");
          }}
          onPressEnter={(e) => {
            e.preventDefault();
            if (resetting || !isValidPassword(password)) return;
            resetPassword();
          }}
        />
        <Button
          disabled={!password || resetting || !isValidPassword(password)}
          shape="round"
          size="large"
          type="primary"
          style={{ width: "100%", marginTop: "20px" }}
          onClick={resetPassword}
        >
          {resetting ? (
            <>
              <Icon name="spinner" spin/> Changing password...
            </>
          ) : !isValidPassword(password) ? (
            "Enter password (at least 6 characters)."
          ) : (
            "Change Password"
          )}
        </Button>
      </form>
      {success && (
        <Alert
          style={{ marginTop: "20px" }}
          message={<b>Success</b>}
          description={<div style={{ fontSize: "12pt" }}>{success}</div>}
          type="success"
          showIcon
        />
      )}
    </AuthPageContainer>
  );
}

function isValidPassword(password: string): boolean {
  return password.length >= 6;
}
