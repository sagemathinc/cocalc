/*
 *  This file is part of CoCalc: Copyright © 2022 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { Alert, Button, Checkbox, Input } from "antd";
import { CSSProperties, useEffect, useRef, useState } from "react";
import {
  GoogleReCaptchaProvider,
  useGoogleReCaptcha,
} from "react-google-recaptcha-v3";

import Markdown from "@cocalc/frontend/editors/slate/static-markdown";
import {
  is_valid_email_address as isValidEmailAddress,
  len,
} from "@cocalc/util/misc";
import { Strategy } from "@cocalc/util/types/sso";
import Logo from "components/logo";
import A from "components/misc/A";
import Loading from "components/share/loading";
import apiPost from "lib/api/post";
import useCustomize from "lib/use-customize";
import { LOGIN_STYLE } from "./shared";
import SSO, { RequiredSSO, useRequiredSSO } from "./sso";
import Tags from "./tags";
import FirstFile from "./first-file";
import { filename_extension } from "@cocalc/util/misc";

const LINE: CSSProperties = { margin: "15px 0" } as const;

const MIN_TAGS = 1;

interface Props {
  minimal?: boolean; // use a minimal interface with less explanation and instructions (e.g., for embedding in other pages)
  requiresToken?: boolean; // will be determined by API call if not given.
  onSuccess?: (opts: { firstFile: string }) => void; // if given, call after sign up *succeeds*.
  has_site_license?: boolean;
  publicPathId?: string;
}

export default function SignUp(props: Props) {
  const { reCaptchaKey } = useCustomize();

  const body = <SignUp0 {...props} />;
  if (reCaptchaKey == null) {
    return body;
  }

  return (
    <GoogleReCaptchaProvider reCaptchaKey={reCaptchaKey}>
      {body}
    </GoogleReCaptchaProvider>
  );
}

function SignUp0({
  requiresToken,
  minimal,
  onSuccess,
  has_site_license,
  publicPathId,
}: Props) {
  const {
    anonymousSignup,
    anonymousSignupLicensedShares,
    siteName,
    emailSignup,
    accountCreationInstructions,
    reCaptchaKey,
    onCoCalcCom,
  } = useCustomize();
  const [tags, setTags] = useState<Set<string>>(new Set());
  const [terms, setTerms] = useState<boolean>(false);
  const [email, setEmail] = useState<string>("");
  const [registrationToken, setRegistrationToken] = useState<string>("");
  const [password, setPassword] = useState<string>("");
  const [firstName, setFirstName] = useState<string>("");
  const [lastName, setLastName] = useState<string>("");
  const [signingUp, setSigningUp] = useState<boolean>(false);
  const [issues, setIssues] = useState<{
    email?: string;
    password?: string;
    terms?: string;
    error?: string;
    registrationToken?: string;
    reCaptcha?: string;
  }>({});

  const submittable = useRef<boolean>(false);
  const { executeRecaptcha } = useGoogleReCaptcha();
  const { strategies } = useCustomize();
  const [firstFile, setFirstFile] = useState<string>("Untitled");

  // Sometimes the user if this component knows requiresToken and sometimes they don't.
  // If they don't, we have to make an API call to figure it out.
  const [requiresToken2, setRequiresToken2] = useState<boolean | undefined>(
    requiresToken
  );

  useEffect(() => {
    if (requiresToken2 === undefined) {
      (async () => {
        try {
          setRequiresToken2(await apiPost("/auth/requires-token"));
        } catch (err) {}
      })();
    }
  }, []);

  // based on email: if user has to sign up via SSO, this will tell which strategy to use.
  const requiredSSO = useRequiredSSO(strategies, email);

  if (requiresToken2 === undefined || strategies == null) {
    return <Loading />;
  }

  submittable.current = !!(
    terms &&
    requiredSSO == null &&
    (!requiresToken2 || registrationToken) &&
    email &&
    isValidEmailAddress(email) &&
    password &&
    firstName &&
    lastName
  );

  async function signUp() {
    if (!submittable.current) return;
    if (signingUp) return;
    setIssues({});
    try {
      setSigningUp(true);

      let reCaptchaToken: undefined | string;
      if (reCaptchaKey) {
        if (!executeRecaptcha) {
          throw Error("Please wait a few seconds, then try again.");
        }
        reCaptchaToken = await executeRecaptcha("signup");
      }

      const result = await apiPost("/auth/sign-up", {
        terms,
        email,
        password,
        firstName,
        lastName,
        registrationToken,
        reCaptchaToken,
        tags: Array.from(tags),
        publicPathId,
      });
      if (result.issues && len(result.issues) > 0) {
        setIssues(result.issues);
      } else {
        if (onSuccess != null) {
          let path = firstFile;
          if (!filename_extension(path)) {
            // try to come up with one based on tags
            for (const tag of [
              "ipynb",
              "py",
              "sage",
              "R",
              "tex",
              "jl",
              "m",
              "term",
              "c",
            ]) {
              if (tags.has(tag)) {
                path += "." + tag.toLowerCase();
                break;
              }
            }
          }

          if (path.endsWith(".ipynb")) {
            // maybe set default kernel for user based on tags
            for (const tag of ["py", "sage", "R", "jl", "m", "c", "term"]) {
              if (tags.has(tag)) {
              }
            }
          }
          onSuccess({ firstFile: path });
        }
      }
    } catch (err) {
      setIssues({ error: `${err}` });
    } finally {
      setSigningUp(false);
    }
  }

  if (!emailSignup && strategies.length == 0) {
    return (
      <Alert
        style={{ margin: "30px 15%" }}
        type="error"
        showIcon
        message={"No Account Creation Allowed"}
        description={
          <div style={{ fontSize: "14pt", marginTop: "20px" }}>
            <b>
              There is no method enabled for creating an account on this server.
            </b>
            {(anonymousSignup ||
              (anonymousSignupLicensedShares && has_site_license)) && (
              <>
                <br />
                <br />
                However, you can still{" "}
                <A href="/auth/try">
                  try {siteName} without creating an account.
                </A>
              </>
            )}
          </div>
        }
      />
    );
  }

  const needsTags = !minimal && tags.size < MIN_TAGS;

  return (
    <div style={{ margin: "30px", minHeight: "50vh" }}>
      {!minimal && (
        <div style={{ textAlign: "center", marginBottom: "15px" }}>
          <Logo
            type="icon"
            style={{ width: "100px", height: "100px", marginBottom: "15px" }}
            priority={true}
          />
          <h1>Create a {siteName} Account</h1>
          <h2 style={{ color: "#666", marginBottom: "35px" }}>
            Sign up for free and get started with {siteName} today!
          </h2>
          {accountCreationInstructions && (
            <Markdown value={accountCreationInstructions} />
          )}
        </div>
      )}

      <div style={{ ...LOGIN_STYLE, maxWidth: "890px" }}>
        {
          <TermsCheckbox
            onChange={setTerms}
            checked={terms}
            style={{
              marginTop: "10px",
              marginBottom: terms ? "10px" : undefined,
              fontSize: "12pt",
              color: "#666",
            }}
          />
        }
        {terms && !minimal && (
          <Tags
            setTags={setTags}
            tags={tags}
            minTags={MIN_TAGS}
            style={{ width: "880px", maxWidth: "100%" }}
          />
        )}
        {terms && !minimal && !needsTags && onCoCalcCom && (
          <FirstFile
            style={{ width: "880px", maxWidth: "100%" }}
            tags={tags}
            setPath={setFirstFile}
            path={firstFile}
          />
        )}
        <form>
          {issues.reCaptcha && (
            <Alert
              style={LINE}
              type="error"
              showIcon
              message={issues.reCaptcha}
              description={<>You may have to contact the site administrator.</>}
            />
          )}

          {issues.registrationToken && (
            <Alert
              style={LINE}
              type="error"
              showIcon
              message={issues.registrationToken}
              description={
                <>
                  You may have to contact the site administrator for a
                  registration token.
                </>
              }
            />
          )}
          {!needsTags && terms && requiresToken2 && (
            <div style={LINE}>
              <p>Registration Token</p>
              <Input
                style={{ fontSize: "12pt" }}
                value={registrationToken}
                placeholder="Enter your secret registration token"
                onChange={(e) => setRegistrationToken(e.target.value)}
              />
            </div>
          )}
          {!needsTags && terms && (
            <EmailOrSSO
              email={email}
              setEmail={setEmail}
              signUp={signUp}
              strategies={strategies}
              hideSSO={requiredSSO != null}
            />
          )}
          <RequiredSSO strategy={requiredSSO} />
          {issues.email && (
            <Alert
              style={LINE}
              type="error"
              showIcon
              message={issues.email}
              description={
                <>
                  Choose a different email address,{" "}
                  <A href="/auth/sign-in">sign in</A>, or{" "}
                  <A href="/auth/password-reset">reset your password</A>.
                </>
              }
            />
          )}
          {!needsTags && terms && email && requiredSSO == null && (
            <div style={LINE}>
              <p>Password</p>
              <Input.Password
                style={{ fontSize: "12pt" }}
                value={password}
                placeholder="Password"
                autoComplete="new-password"
                onChange={(e) => setPassword(e.target.value)}
                onPressEnter={signUp}
              />
            </div>
          )}
          {issues.password && (
            <Alert style={LINE} type="error" showIcon message={issues.email} />
          )}
          {!needsTags &&
            terms &&
            email &&
            requiredSSO == null &&
            password?.length >= 6 && (
              <div style={LINE}>
                <p>First name (Given name)</p>
                <Input
                  style={{ fontSize: "12pt" }}
                  placeholder="First name"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  onPressEnter={signUp}
                />
              </div>
            )}
          {!needsTags &&
            terms &&
            email &&
            password &&
            requiredSSO == null &&
            firstName && (
              <div style={LINE}>
                <p>Last name (Family name)</p>
                <Input
                  style={{ fontSize: "12pt" }}
                  placeholder="Last name"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  onPressEnter={signUp}
                />
              </div>
            )}
        </form>
        <div style={LINE}>
          <Button
            shape="round"
            size="large"
            disabled={!submittable.current || signingUp}
            type="primary"
            style={{ width: "100%", marginTop: "15px" }}
            onClick={signUp}
          >
            {needsTags && tags.size < 2
              ? `Select at least ${MIN_TAGS}`
              : !terms
              ? "Agree to the terms"
              : requiresToken2 && !registrationToken
              ? "Enter the secret registration token"
              : !email
              ? "How will you sign in?"
              : requiredSSO != null
              ? "You must sign up via SSO"
              : !password || password.length < 6
              ? "Choose password with at least 6 characters"
              : !firstName
              ? "Enter your first name above"
              : !lastName
              ? "Enter your last name above"
              : !isValidEmailAddress(email)
              ? "Enter a valid email address above"
              : signingUp
              ? ""
              : "Sign Up!"}
            {signingUp && (
              <span style={{ marginLeft: "15px" }}>
                <Loading>Signing Up...</Loading>
              </span>
            )}
          </Button>
        </div>
        {issues.error && (
          <Alert style={LINE} type="error" showIcon message={issues.error} />
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
          Already have an account? <A href="/auth/sign-in">Sign In</A>
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

interface EmailOrSSOProps {
  email: string;
  setEmail: (email: string) => void;
  signUp: () => void;
  strategies?: Strategy[];
  hideSSO?: boolean;
}

function EmailOrSSO(props: EmailOrSSOProps) {
  const { email, setEmail, signUp, strategies = [], hideSSO = false } = props;
  const { emailSignup } = useCustomize();

  function renderSSO() {
    if (strategies.length == 0) return;

    const emailStyle: CSSProperties = email
      ? { textAlign: "right", marginBottom: "20px" }
      : {};

    const style: CSSProperties = {
      display: hideSSO ? "none" : "block",
      ...emailStyle,
    };

    return (
      <div style={{ textAlign: "center", margin: "20px 0" }}>
        <SSO size={email ? 24 : undefined} style={style} />
      </div>
    );
  }

  return (
    <div>
      <div style={{ textAlign: "center" }}>
        <p style={{ color: "#444", marginTop: "20px" }}>
          {hideSSO
            ? "Sign up using your single sign-on provider"
            : strategies.length > 0 && emailSignup
            ? "Sign up using either your email address or a single sign-on provider."
            : emailSignup
            ? "Enter the email address you will use to sign in."
            : "Sign up using a single sign-on provider."}
        </p>
      </div>
      {renderSSO()}
      {emailSignup && (
        <p>
          <Input
            style={{ fontSize: "12pt" }}
            placeholder="Email address"
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onPressEnter={signUp}
          />
        </p>
      )}
    </div>
  );
}

export function TermsCheckbox({
  checked,
  onChange,
  style,
}: {
  checked?: boolean;
  onChange?: (boolean) => void;
  style?: CSSProperties;
}) {
  return (
    <Checkbox
      checked={checked}
      style={style}
      onChange={(e) => onChange?.(e.target.checked)}
    >
      I agree to the{" "}
      <A external={true} href="/policies/terms">
        Terms of Service
      </A>
      .
    </Checkbox>
  );
}
