import { Alert, Button, Input, Space } from "antd";
import { useState } from "react";

import api from "@cocalc/frontend/client/api";
import { is_valid_email_address as isValidEmailAddress } from "@cocalc/util/misc";
import type { AuthView } from "./types";

interface PasswordResetProps {
  onNavigate: (view: AuthView) => void;
}

export default function PasswordResetForm({ onNavigate }: PasswordResetProps) {
  const [email, setEmail] = useState<string>("");
  const [resetting, setResetting] = useState<boolean>(false);
  const [error, setError] = useState<string>("");
  const [success, setSuccess] = useState<string>("");

  const canSubmit = isValidEmailAddress(email) && !resetting;

  async function resetPassword() {
    if (!canSubmit) {
      return;
    }
    setError("");
    setSuccess("");
    setResetting(true);
    try {
      const result = await api("auth/password-reset", { email });
      if (result?.error) {
        setError(result.error);
        return;
      }
      setEmail("");
      setSuccess(
        result?.success ??
          "Password reset email sent. Check your inbox for the reset link.",
      );
    } catch (err) {
      setError(`${err}`);
    } finally {
      setResetting(false);
    }
  }

  return (
    <Space direction="vertical" size="middle" style={{ width: "100%" }}>
      {error && <Alert type="error" showIcon message={error} />}
      {success && <Alert type="success" showIcon message={success} />}
      <div>
        <div>Email address</div>
        <Input
          autoFocus
          value={email}
          autoComplete="username"
          placeholder="you@example.com"
          onChange={(e) => setEmail(e.target.value)}
          onPressEnter={resetPassword}
        />
      </div>
      <Button
        type="primary"
        size="large"
        disabled={!canSubmit}
        onClick={resetPassword}
      >
        {resetting ? "Sending reset email..." : "Send password reset email"}
      </Button>
      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <a
          onClick={() => onNavigate("sign-in")}
          style={{ cursor: "pointer" }}
        >
          Back to sign in
        </a>
        <a
          onClick={() => onNavigate("sign-up")}
          style={{ cursor: "pointer" }}
        >
          Create an account
        </a>
      </div>
    </Space>
  );
}
