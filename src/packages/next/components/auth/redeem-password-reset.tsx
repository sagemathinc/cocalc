import { Alert, Button, Input } from "antd";
import { useState } from "react";
import SquareLogo from "components/logo-square";
import useCustomize from "lib/use-customize";
import A from "components/misc/A";
import { LOGIN_STYLE } from "./shared";
import apiPost from "lib/api/post";
import { Icon } from "@cocalc/frontend/components/icon";
import Contact from "components/landing/contact";
import { useRouter } from "next/router";

export default function PasswordReset({ passwordResetId }) {
  const { account, siteName } = useCustomize();
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
      // if no error got signed in, so do a page refresh to see this
      router.reload();
    } catch (err) {
      setError(`${err}`);
    } finally {
      setResetting(false);
    }
  }

  return (
    <div style={{ padding: "15px" }}>
      <div style={{ textAlign: "center", marginBottom: "15px" }}>
        <SquareLogo style={{ width: "100px", height: "100px" }} />
        <h1>
          {account ? "Successfully " : ""}Reset Your {siteName} Password
        </h1>
      </div>
      {account && (
        <div style={LOGIN_STYLE}>
          <Alert
            style={{ marginTop: "20px" }}
            message={<b>Success</b>}
            description={
              <div style={{ fontSize: "12pt" }}>
                Password successfully set. You are now signed in using your new
                password.
              </div>
            }
            type="success"
            showIcon
          />
        </div>
      )}

      {!account && (
        <>
          <div style={LOGIN_STYLE}>
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
              {password && (
                <Button
                  disabled={resetting || !isValidPassword(password)}
                  shape="round"
                  size="large"
                  type="primary"
                  style={{ width: "100%", marginTop: "20px" }}
                  onClick={resetPassword}
                >
                  {resetting ? (
                    <>
                      <Icon name="spinner" spin /> Changing password...
                    </>
                  ) : !isValidPassword(password) ? (
                    "Enter password (at least 6 characters)."
                  ) : (
                    "Change Password"
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
                    <b>{error}</b>
                    <br /> If you are stuck <Contact lower />.
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
            You can also{" "}
            <A href="/auth/try">use {siteName} without creating an account</A>
          </div>
        </>
      )}
    </div>
  );
}

function isValidPassword(password: string): boolean {
  return password.length >= 6;
}
