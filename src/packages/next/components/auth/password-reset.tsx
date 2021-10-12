import { Alert, Button, Input } from "antd";
import { useState } from "react";
import SquareLogo from "components/logo-square";
import useCustomize from "lib/use-customize";
import A from "components/misc/A";
import { LOGIN_STYLE } from "./shared";
import apiPost from "lib/api/post";
import { Icon } from "@cocalc/frontend/components/icon";
import Contact from "components/landing/contact";
import { is_valid_email_address as isValidEmailAddress } from "@cocalc/util/misc";

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
      if (result.error) {
        setError(`${result.error}`);
      } else if (result.success) {
        setEmail("");
        setSuccess(result.success);
      }
    } catch (err) {
      setError(`${err}`);
    } finally {
      setResetting(false);
    }
  }

  return (
    <div style={{ padding: "0 15px" }}>
      <div style={{ textAlign: "center", marginBottom: "15px" }}>
        <SquareLogo style={{ width: "100px", height: "100px" }} />
        <h1>Reset Your {siteName} Password</h1>
      </div>

      <div style={LOGIN_STYLE}>
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
          {email && (
            <Button
              disabled={resetting || !isValidEmailAddress(email) || !!error}
              shape="round"
              size="large"
              type="primary"
              style={{ width: "100%", marginTop: "20px" }}
              onClick={resetPassword}
            >
              {resetting ? (
                <>
                  <Icon name="spinner" spin /> Sending password reset email...
                </>
              ) : !email || !isValidEmailAddress(email) || error ? (
                "Enter your email address."
              ) : (
                "Send password reset email"
              )}
            </Button>
          )}
        </form>
        {error && (
          <Alert
            style={{ marginTop: "20px" }}
            message="Error"
            description={
              <div style={{ fontSize: "12pt" }}>
                <b>{error}</b> If you are stuck <Contact />.
              </div>
            }
            type="error"
            showIcon
          />
        )}
        {success && (
          <Alert
            style={{ marginTop: "20px" }}
            message={<b>Success</b>}
            description={<div style={{ fontSize: "12pt" }}>{success}</div>}
            type="success"
            showIcon
          />
        )}
      </div>

      <div
        style={{
          ...LOGIN_STYLE,
          backgroundColor: "white",
          marginTop: "30px",
          marginBottom: "30px",
          paddingTop: "15px",
        }}
      >
        <p>
          Remember your password? <A href="/auth/sign-in">Sign In</A>
        </p>
        <p>
          Do not have an account? <A href="/auth/sign-up">Sign Up</A>
        </p>
        You can also{" "}
        <A href="/auth/try">try {siteName} without creating an account</A>
      </div>
    </div>
  );
}
