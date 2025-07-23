/*
 *  This file is part of CoCalc: Copyright © 2022 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Button, Input } from "antd";
import { useEffect, useState } from "react";
import {
  GoogleReCaptchaProvider,
  useGoogleReCaptcha,
} from "react-google-recaptcha-v3";

import { Icon } from "@cocalc/frontend/components/icon";
import Contact from "components/landing/contact";
import A from "components/misc/A";
import apiPost from "lib/api/post";
import useCustomize from "lib/use-customize";
import AuthPageContainer from "./fragments/auth-page-container";
import SSO, { RequiredSSO, useRequiredSSO } from "./sso";
import { MAX_PASSWORD_LENGTH } from "@cocalc/util/auth";

interface SignInProps {
  minimal?: boolean;
  onSuccess?: () => void; // if given, call after sign in *succeeds*.
  showSignUp?: boolean;
  signUpAction?: () => void; // if given, replaces the default sign-up link behavior.
}

export default function SignIn(props: SignInProps) {
  const { reCaptchaKey } = useCustomize();

  const body = <SignIn0 {...props} />;
  if (reCaptchaKey == null) {
    return body;
  }

  return (
    <GoogleReCaptchaProvider reCaptchaKey={reCaptchaKey}>
      {body}
    </GoogleReCaptchaProvider>
  );
}

function SignIn0(props: SignInProps) {
  const { minimal = false, onSuccess, showSignUp, signUpAction } = props;
  const { anonymousSignup, reCaptchaKey, siteName, strategies } =
    useCustomize();
  const [email, setEmail] = useState<string>("");
  const [password, setPassword] = useState<string>("");
  const [signingIn, setSigningIn] = useState<boolean>(false);
  const [error, setError] = useState<string>("");
  const [haveSSO, setHaveSSO] = useState<boolean>(false);
  const { executeRecaptcha } = useGoogleReCaptcha();

  useEffect(() => {
    setHaveSSO(strategies != null && strategies.length > 0);
  }, []);

  // based on email: if user has to sign up via SSO, this will tell which strategy to use.
  const requiredSSO = useRequiredSSO(strategies, email);

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

  function renderFooter() {
    return (
      (!minimal || showSignUp) && (
        <>
          New to CoCalc?{" "}
          {signUpAction ? (
            <a onClick={signUpAction}>Sign Up</a>
          ) : (
            <A href="/auth/sign-up">Sign Up</A>
          )}{" "}
          {anonymousSignup ? (
            <>
              or{" "}
              <A href="/auth/try">
                {" "}
                try {siteName} without creating an account.{" "}
              </A>
            </>
          ) : (
            "today."
          )}
        </>
      )
    );
  }

  function renderError() {
    return (
      error && (
        <>
          <p>
            <b>{error}</b>
          </p>
          <p>
            If you can't remember your password,{" "}
            <A href="/auth/password-reset">reset it</A>. If that doesn't work{" "}
            <Contact />.
          </p>
        </>
      )
    );
  }

  return (
    <AuthPageContainer
      error={renderError()}
      footer={renderFooter()}
      minimal={minimal}
      title={`Sign in to ${siteName}`}
    >
      <div style={{ margin: "10px 0" }}>
        {strategies == null
          ? "Sign in"
          : haveSSO
            ? requiredSSO != null
              ? "Sign in using your single sign-on provider"
              : "Sign in using your email address or a single sign-on provider."
            : "Sign in using your email address."}
      </div>
      <form>
        {haveSSO && (
          <div
            style={{
              textAlign: "center",
              margin: "20px 0",
              display: requiredSSO == null ? "inherit" : "none",
            }}
          >
            <SSO
              size={email ? 24 : undefined}
              style={
                email ? { textAlign: "right", marginBottom: "20px" } : undefined
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

        <RequiredSSO strategy={requiredSSO} />
        {/* Don't remove password input, since that messes up autofill. Hide for forced SSO. */}
        <div
          style={{
            marginTop: "30px",
            display: requiredSSO == null ? "inherit" : "none",
          }}
        >
          <p>Password </p>
          <Input.Password
            style={{ fontSize: "12pt" }}
            autoComplete="current-password"
            placeholder="Password"
            maxLength={MAX_PASSWORD_LENGTH}
            onChange={(e) => setPassword(e.target.value)}
            onPressEnter={(e) => {
              e.preventDefault();
              signIn();
            }}
          />
        </div>
        {requiredSSO == null && (
          <>
            <Button
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
              ) : (
                "Sign In"
              )}
            </Button>
            <div style={{ marginTop: "18px" }}>
              <A href={"/auth/password-reset"}>Forgot your password?</A>
            </div>
          </>
        )}
      </form>
    </AuthPageContainer>
  );
}
