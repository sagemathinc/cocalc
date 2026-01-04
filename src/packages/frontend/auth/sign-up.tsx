import { Alert, Button, Input, Space } from "antd";
import { useEffect, useMemo, useState } from "react";

import api from "@cocalc/frontend/client/api";
import { QueryParams } from "@cocalc/frontend/misc/query-params";
import { useTypedRedux } from "@cocalc/frontend/app-framework";
import {
  is_valid_email_address as isValidEmailAddress,
  len,
} from "@cocalc/util/misc";
import {
  MAX_PASSWORD_LENGTH,
  MIN_PASSWORD_LENGTH,
} from "@cocalc/util/auth";
import type { AuthView } from "./types";
import { appUrl } from "./util";

interface SignUpProps {
  onNavigate: (view: AuthView) => void;
}

export default function SignUpForm({ onNavigate }: SignUpProps) {
  const tokenFromStore = useTypedRedux("account", "token");
  const [requiresToken, setRequiresToken] = useState<
    boolean | undefined
  >(tokenFromStore);
  const [registrationToken, setRegistrationToken] = useState<string>(
    QueryParams.get("registrationToken") ?? "",
  );
  const [email, setEmail] = useState<string>("");
  const [password, setPassword] = useState<string>("");
  const [firstName, setFirstName] = useState<string>("");
  const [lastName, setLastName] = useState<string>("");
  const [signingUp, setSigningUp] = useState<boolean>(false);
  const [issues, setIssues] = useState<Record<string, string>>({});
  const [error, setError] = useState<string>("");

  const bootstrap = useMemo(
    () => QueryParams.get("bootstrap") === "1",
    [],
  );

  useEffect(() => {
    if (tokenFromStore !== undefined) {
      setRequiresToken(!!tokenFromStore);
    }
  }, [tokenFromStore]);

  useEffect(() => {
    if (requiresToken !== undefined) {
      return;
    }
    (async () => {
      try {
        const result = await api("auth/requires-token");
        setRequiresToken(!!result);
      } catch (_err) {
        setRequiresToken(false);
      }
    })();
  }, [requiresToken]);

  const canSubmit = useMemo(() => {
    if (!isValidEmailAddress(email)) {
      return false;
    }
    if (password.length < MIN_PASSWORD_LENGTH) {
      return false;
    }
    if (!firstName.trim() || !lastName.trim()) {
      return false;
    }
    if (requiresToken && !registrationToken.trim()) {
      return false;
    }
    return !signingUp;
  }, [
    email,
    password,
    firstName,
    lastName,
    requiresToken,
    registrationToken,
    signingUp,
  ]);

  async function signUp() {
    if (!canSubmit) {
      return;
    }
    setIssues({});
    setError("");
    setSigningUp(true);
    try {
      const result = await api("auth/sign-up", {
        terms: true,
        email,
        password,
        firstName,
        lastName,
        registrationToken: registrationToken.trim(),
      });
      if (result?.issues && len(result.issues) > 0) {
        setIssues(result.issues);
        return;
      }
      window.location.href = appUrl("app?sign-in");
    } catch (err) {
      setError(`${err}`);
    } finally {
      setSigningUp(false);
    }
  }

  const issueList = Object.values(issues).filter(Boolean);

  return (
    <Space direction="vertical" size="middle" style={{ width: "100%" }}>
      {bootstrap && (
        <Alert
          type="info"
          showIcon
          message="You are creating the initial admin account for this server."
        />
      )}
      {error && <Alert type="error" showIcon message={error} />}
      {issueList.length > 0 && (
        <Alert
          type="error"
          showIcon
          message="Sign up failed"
          description={
            <ul style={{ margin: 0, paddingLeft: "18px" }}>
              {issueList.map((issue, idx) => (
                <li key={idx}>{issue}</li>
              ))}
            </ul>
          }
        />
      )}
      {requiresToken && (
        <div>
          <div>Registration token</div>
          <Input
            value={registrationToken}
            placeholder="Enter your registration token"
            onChange={(e) => setRegistrationToken(e.target.value)}
          />
        </div>
      )}
      <div>
        <div>Email address</div>
        <Input
          value={email}
          autoComplete="username"
          placeholder="you@example.com"
          onChange={(e) => setEmail(e.target.value)}
          onPressEnter={signUp}
        />
      </div>
      <div>
        <div>Password</div>
        <Input.Password
          value={password}
          autoComplete="new-password"
          placeholder={`At least ${MIN_PASSWORD_LENGTH} characters`}
          maxLength={MAX_PASSWORD_LENGTH}
          onChange={(e) => setPassword(e.target.value)}
          onPressEnter={signUp}
        />
      </div>
      <div>
        <div>First name</div>
        <Input
          value={firstName}
          placeholder="First name"
          onChange={(e) => setFirstName(e.target.value)}
          onPressEnter={signUp}
        />
      </div>
      <div>
        <div>Last name</div>
        <Input
          value={lastName}
          placeholder="Last name"
          onChange={(e) => setLastName(e.target.value)}
          onPressEnter={signUp}
        />
      </div>
      <Button
        type="primary"
        size="large"
        disabled={!canSubmit}
        onClick={signUp}
      >
        {signingUp ? "Creating account..." : "Create account"}
      </Button>
      <div style={{ textAlign: "center" }}>
        Already have an account?{" "}
        <a
          onClick={() => onNavigate("sign-in")}
          style={{ cursor: "pointer" }}
        >
          Sign in
        </a>
      </div>
    </Space>
  );
}
