/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Alert, Button, Input } from "antd";
import { useState } from "react";

import { Icon } from "@cocalc/frontend/components/icon";
import { is_valid_email_address as isValidEmailAddress } from "@cocalc/util/misc";
import Contact from "components/landing/contact";
import A from "components/misc/A";
import apiPost from "lib/api/post";
import useCustomize from "lib/use-customize";

import AuthPageContainer from "./fragments/auth-page-container";

export default function PasswordReset() {
  const { siteName } = useCustomize();
  const [email, setEmail] = useState<string>("");
  const [resetting, setResetting] = useState<boolean>(false);
  const [error, setError] = useState<string>("");
  const [success, setSuccess] = useState<string>("");

  async function resetPassword() {
    if (resetting) return;
    try {
      setError("");
      setSuccess("");
      setResetting(true);
      const result = await apiPost("/auth/password-reset", { email });
      if (result.success) {
        setEmail("");
        setSuccess(result.success);
      }
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
        <p>
          Don't have an account? <A href="/auth/sign-up">Sign Up</A>
        </p>
        You can also {" "}
        <A href="/auth/try">try {siteName} without creating an account</A>
      </>
    );
  }

  function renderError() {
    return error && (
      <div style={{ fontSize: "12pt" }}>
        <b>{error}</b>
        <br/>
        If you are stuck, please <Contact lower/>.
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
        Enter your {siteName} account's email address and we will email a
        password reset link to you.
      </div>
      <form>
        <Input
          style={{ fontSize: "13pt" }}
          autoFocus
          placeholder="Enter your email address"
          autoComplete="username"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            setError("");
            setSuccess("");
          }}
          onPressEnter={(e) => {
            e.preventDefault();
            if (resetting || !isValidEmailAddress(email)) return;
            resetPassword();
          }}
        />
        <Button
          disabled={!email || resetting || !isValidEmailAddress(email) || !!error}
          shape="round"
          size="large"
          type="primary"
          style={{ width: "100%", marginTop: "20px" }}
          onClick={resetPassword}
        >
          {resetting ? (
            <>
              <Icon name="spinner" spin/> Sending password reset email...
            </>
          ) : !email || !isValidEmailAddress(email) || error ? (
            "Enter your email address."
          ) : (
            "Send password reset email"
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
