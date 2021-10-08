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

  async function resetPassword() {
    if (resetting) return;
    try {
      setError("");
      setResetting(true);
      const result = await apiPost("/account/password-reset", { email });
      if (result.error) {
        setError(`${result.error}`);
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
          Enter your account's email address and we will send you a password
          reset link.
        </div>
        <form>
          <Input
            style={{ fontSize: "13pt" }}
            autoFocus
            placeholder="Enter your email address"
            autoComplete="username"
            onChange={(e) => setEmail(e.target.value)}
            onPressEnter={(e) => {
              e.preventDefault();
              resetPassword();
            }}
          />
          {email && (
            <Button
              disabled={resetting || !email || !isValidEmailAddress(email)}
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
              ) : !email || !isValidEmailAddress(email) ? (
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
              <>
                <p>
                  <b>{error}</b>
                </p>
                <p>
                  If you are stuck <Contact />.
                </p>
              </>
            }
            type="error"
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
        }}
      >
        <p>
          Remember your password? <A href="/sign-in">Sign In</A>
        </p>
        <p>
          Do not have an account? <A href="/sign-up">Sign Up</A>
        </p>
        <p>
          You can also{" "}
          <A href="/try">try {siteName} without creating an account</A>
        </p>
      </div>
    </div>
  );
}
