import { Alert, Button, Input } from "antd";
import { useState } from "react";
import SquareLogo from "components/logo-square";
import useCustomize from "lib/use-customize";
import A from "components/misc/A";
import SSO from "./sso";
import { LOGIN_STYLE } from "./shared";
import apiPost from "lib/api/post";
import { Icon } from "@cocalc/frontend/components/icon";
import Contact from "components/landing/contact";
import { useRouter } from "next/router";

export default function SignIn() {
  const { siteName } = useCustomize();
  const [email, setEmail] = useState<string>("");
  const [password, setPassword] = useState<string>("");
  const [signingIn, setSigningIn] = useState<boolean>(false);
  const [error, setError] = useState<string>("");
  const router = useRouter();

  async function signIn() {
    if (signingIn) return;
    try {
      setError("");
      setSigningIn(true);
      const result = await apiPost("account/sign-in", { email, password });
      if (result.error) {
        setError(`${result.error}`);
      } else {
        router.push("/");
      }
    } catch (err) {
      setError(`${err}`);
    } finally {
      setSigningIn(false);
    }
  }

  return (
    <div style={{ padding: "0 15px" }}>
      <div style={{ textAlign: "center", marginBottom: "15px" }}>
        <SquareLogo style={{ width: "100px", height: "100px" }} />
        <h1>Sign In to {siteName}</h1>
      </div>

      <div style={LOGIN_STYLE}>
        <div style={{ margin: "10px 0" }}>
          Sign in using your email address and password or{" "}
          <div style={{ textAlign: "center", marginTop: "10px" }}>
            <SSO />
          </div>
        </div>
        <form>
          <Input
            autoFocus
            placeholder="Email address"
            autoComplete="username"
            onChange={(e) => setEmail(e.target.value)}
          />
          {email && (
            <div style={{ marginTop: "30px" }}>
              <p>
                Password{" "}
                <A style={{ float: "right" }} href="/password_reset">
                  Forgot password?
                </A>
              </p>
              <Input.Password
                autoComplete="current-password"
                placeholder="Password"
                onChange={(e) => setPassword(e.target.value)}
                onPressEnter={signIn}
              />
            </div>
          )}
          {email && (
            <Button
              disabled={signingIn || !(password?.length >= 6)}
              shape="round"
              size="large"
              type="primary"
              style={{ width: "100%", marginTop: "20px" }}
              onClick={signIn}
            >
              {signingIn ? (
                <>
                  <Icon name="spinner" spin /> Signing In...
                </>
              ) : !password || password.length < 6 ? (
                "Enter your password above."
              ) : (
                "Sign In"
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
                  If you can't remember your password,{" "}
                  <A href="/password_reset">reset it</A>. If that doesn't work{" "}
                  <Contact />.
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
          New to {siteName}? <A href="/sign-up">Sign Up</A>
        </p>
        Unsure? <A href="/try">Try {siteName} without creating an account</A>
      </div>
    </div>
  );
}
