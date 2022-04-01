import { Alert, Button, Input } from "antd";
import { useState } from "react";
import SquareLogo from "components/logo-square";
import useCustomize from "lib/use-customize";
import A from "components/misc/A";
import SSO, { Strategy } from "./sso";
import { LOGIN_STYLE } from "./shared";
import apiPost from "lib/api/post";
import { Icon } from "@cocalc/frontend/components/icon";
import Contact from "components/landing/contact";
import {
  GoogleReCaptchaProvider,
  useGoogleReCaptcha,
} from "react-google-recaptcha-v3";

interface Props {
  strategies?: Strategy[];
  minimal?: boolean;
  onSuccess?: () => void; // if given, call after sign in *succeeds*.
}

export default function SignIn(props: Props) {
  const { reCaptchaKey } = useCustomize();

  return (
    <GoogleReCaptchaProvider reCaptchaKey={reCaptchaKey}>
      <SignIn0 {...props} />
    </GoogleReCaptchaProvider>
  );
}

function SignIn0({ strategies, minimal, onSuccess }: Props) {
  const { anonymousSignup, reCaptchaKey, siteName } = useCustomize();
  const [email, setEmail] = useState<string>("");
  const [password, setPassword] = useState<string>("");
  const [signingIn, setSigningIn] = useState<boolean>(false);
  const [error, setError] = useState<string>("");
  const { executeRecaptcha } = useGoogleReCaptcha();

  async function signIn() {
    if (signingIn) return;
    setError("");
    try {
      setSigningIn(true);

      let reCaptchaToken: undefined | string;
      if (reCaptchaKey) {
        if (!executeRecaptcha) {
          throw Error("Please wait a few seconds, then try again.");
        }
        reCaptchaToken = await executeRecaptcha("signin");
      }

      await apiPost("/auth/sign-in", {
        email,
        password,
        reCaptchaToken,
      });
      onSuccess?.();
    } catch (err) {
      setError(`${err}`);
    } finally {
      setSigningIn(false);
    }
  }

  return (
    <div style={{ padding: "0 15px" }}>
      {!minimal && (
        <div style={{ textAlign: "center", marginBottom: "15px" }}>
          <SquareLogo
            style={{ width: "100px", height: "100px", marginBottom: "15px" }}
          />
          <h1>Sign In to {siteName}</h1>
        </div>
      )}

      <div style={LOGIN_STYLE}>
        <div style={{ margin: "10px 0" }}>
          {strategies != null
            ? strategies.length > 0
              ? "Sign in using your email address or a single sign on provider."
              : "Sign in using your email address."
            : "Sign in"}
        </div>
        <form>
          {strategies != null && strategies.length > 0 && (
            <div style={{ textAlign: "center", margin: "20px 0" }}>
              <SSO
                strategies={strategies}
                size={email ? 24 : undefined}
                style={
                  email ? { float: "right", marginBottom: "20px" } : undefined
                }
              />
            </div>
          )}
          <Input
            autoFocus
            style={{ fontSize: "12pt" }}
            placeholder="Email address"
            autoComplete="username"
            onChange={(e) => setEmail(e.target.value)}
          />
          {/* Don't ever hide password input, since that messes up autofill */}
          <div style={{ marginTop: "30px" }}>
            <p>Password </p>
            <Input.Password
              style={{ fontSize: "12pt" }}
              autoComplete="current-password"
              placeholder="Password"
              onChange={(e) => setPassword(e.target.value)}
              onPressEnter={(e) => {
                e.preventDefault();
                signIn();
              }}
            />
          </div>
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
          <>
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
                    <A href="/auth/password-reset">reset it</A>. If that doesn't
                    work <Contact />.
                  </p>
                </>
              }
              type="error"
              showIcon
            />
            <div
              style={{
                textAlign: "center",
                marginTop: "15px",
                fontSize: "14pt",
              }}
            >
              <A href="/auth/password-reset">Forgot password?</A>
            </div>
          </>
        )}
      </div>

      {!minimal && (
        <div
          style={{
            ...LOGIN_STYLE,
            backgroundColor: "white",
            margin: "30px auto",
            padding: "15px",
          }}
        >
          New to {siteName}? <A href="/auth/sign-up">Sign Up</A>
          {anonymousSignup && (
            <div style={{ marginTop: "15px" }}>
              Don't want to provide any information?
              <br />
              <A href="/auth/try">
                Try {siteName} without creating an account.
              </A>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
