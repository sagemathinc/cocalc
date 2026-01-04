import { Alert, Button, Input, Space } from "antd";
import { useState } from "react";

import api from "@cocalc/frontend/client/api";
import { is_valid_email_address as isValidEmailAddress } from "@cocalc/util/misc";
import { MAX_PASSWORD_LENGTH } from "@cocalc/util/auth";
import type { AuthView } from "./types";
import { appUrl } from "./util";

interface SignInProps {
  onNavigate: (view: AuthView) => void;
}

export default function SignInForm({ onNavigate }: SignInProps) {
  const [email, setEmail] = useState<string>("");
  const [password, setPassword] = useState<string>("");
  const [signingIn, setSigningIn] = useState<boolean>(false);
  const [error, setError] = useState<string>("");

  const canSubmit =
    isValidEmailAddress(email) && password.length > 0 && !signingIn;

  async function signIn() {
    if (!canSubmit) {
      return;
    }
    setError("");
    setSigningIn(true);
    try {
      await api("auth/sign-in", { email, password });
      window.location.href = appUrl("app?sign-in");
    } catch (err) {
      setError(`${err}`);
    } finally {
      setSigningIn(false);
    }
  }

  return (
    <Space direction="vertical" size="middle" style={{ width: "100%" }}>
      {error && <Alert type="error" showIcon message={error} />}
      <div>
        <div>Email address</div>
        <Input
          autoFocus
          value={email}
          autoComplete="username"
          placeholder="you@example.com"
          onChange={(e) => setEmail(e.target.value)}
          onPressEnter={signIn}
        />
      </div>
      <div>
        <div>Password</div>
        <Input.Password
          value={password}
          autoComplete="current-password"
          placeholder="Password"
          maxLength={MAX_PASSWORD_LENGTH}
          onChange={(e) => setPassword(e.target.value)}
          onPressEnter={signIn}
        />
      </div>
      <Button
        type="primary"
        size="large"
        disabled={!canSubmit}
        onClick={signIn}
      >
        {signingIn ? "Signing In..." : "Sign In"}
      </Button>
      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <a
          onClick={() => onNavigate("password-reset")}
          style={{ cursor: "pointer" }}
        >
          Forgot password?
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
