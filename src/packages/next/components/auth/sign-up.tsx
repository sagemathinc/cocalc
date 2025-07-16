/*
 *  This file is part of CoCalc: Copyright © 2022 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Alert, Button, Checkbox, Divider, Input } from "antd";
import { CSSProperties, useEffect, useRef, useState } from "react";
import {
  GoogleReCaptchaProvider,
  useGoogleReCaptcha,
} from "react-google-recaptcha-v3";
import Markdown from "@cocalc/frontend/editors/slate/static-markdown";
import { MAX_PASSWORD_LENGTH } from "@cocalc/util/auth";
import {
  CONTACT_TAG,
  CONTACT_THESE_TAGS,
} from "@cocalc/util/db-schema/accounts";
import {
  is_valid_email_address as isValidEmailAddress,
  len,
  plural,
  smallIntegerToEnglishWord,
} from "@cocalc/util/misc";
import { COLORS } from "@cocalc/util/theme";
import { Strategy } from "@cocalc/util/types/sso";
import { Paragraph } from "components/misc";
import A from "components/misc/A";
import Loading from "components/share/loading";
import apiPost from "lib/api/post";
import useCustomize from "lib/use-customize";
import AuthPageContainer from "./fragments/auth-page-container";
import SSO, { RequiredSSO, useRequiredSSO } from "./sso";
import Tags from "./tags";

const LINE: CSSProperties = { margin: "15px 0" } as const;

interface SignUpProps {
  minimal?: boolean; // use a minimal interface with less explanation and instructions (e.g., for embedding in other pages)
  requiresToken?: boolean; // will be determined by API call if not given.
  onSuccess?: () => void; // if given, call after sign up *succeeds*.
  has_site_license?: boolean;
  publicPathId?: string;
  showSignIn?: boolean;
  signInAction?: () => void; // if given, replaces the default sign-in link behavior.
  requireTags: boolean;
}

export default function SignUp(props: SignUpProps) {
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
  signInAction,
  showSignIn,
  requireTags,
}: SignUpProps) {
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
  const [signupReason, setSignupReason] = useState<string>("");
  const [email, setEmail] = useState<string>("");
  const [registrationToken, setRegistrationToken] = useState<string>("");
  const [password, setPassword] = useState<string>("");
  const [firstName, setFirstName] = useState<string>("");
  const [lastName, setLastName] = useState<string>("");
  const [signingUp, setSigningUp] = useState<boolean>(false);
  const [issues, setIssues] = useState<{
    email?: string;
    password?: string;
    error?: string;
    registrationToken?: string;
    reCaptcha?: string;
  }>({});

  const minTags = requireTags ? 1 : 0;
  const showContact = CONTACT_THESE_TAGS.some((t) => tags.has(t));
  const requestContact = tags.has(CONTACT_TAG) && showContact;

  const submittable = useRef<boolean>(false);
  const { executeRecaptcha } = useGoogleReCaptcha();
  const { strategies, supportVideoCall } = useCustomize();

  // Sometimes the user if this component knows requiresToken and sometimes they don't.
  // If they don't, we have to make an API call to figure it out.
  const [requiresToken2, setRequiresToken2] = useState<boolean | undefined>(
    requiresToken,
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

  // number of tags except for the one name "CONTACT_TAG"
  const tagsSize = tags.size - (requestContact ? 1 : 0);
  const needsTags = !minimal && onCoCalcCom && tagsSize < minTags;
  const what = "role";

  submittable.current = !!(
    requiredSSO == null &&
    (!requiresToken2 || registrationToken) &&
    email &&
    isValidEmailAddress(email) &&
    password &&
    password.length >= 6 &&
    firstName?.trim() &&
    lastName?.trim() &&
    !needsTags
  );

  async function signUp() {
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
        terms: true,
        email,
        password,
        firstName,
        lastName,
        registrationToken,
        reCaptchaToken,
        publicPathId,
        tags: Array.from(tags),
        signupReason,
      });
      if (result.issues && len(result.issues) > 0) {
        setIssues(result.issues);
      } else {
        onSuccess?.();
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

  function renderFooter() {
    return (
      (!minimal || showSignIn) && (
        <>
          <div>
            Already have an account?{" "}
            {signInAction ? (
              <a onClick={signInAction}>Sign In</a>
            ) : (
              <A href="/auth/sign-in">Sign In</A>
            )}{" "}
            {anonymousSignup && (
              <>
                or{" "}
                <A href="/auth/try">
                  {" "}
                  try {siteName} without creating an account.{" "}
                </A>
              </>
            )}
          </div>
        </>
      )
    );
  }

  function renderError() {
    return (
      issues.error && (
        <Alert style={LINE} type="error" showIcon message={issues.error} />
      )
    );
  }

  function renderSubtitle() {
    return (
      <>
        <h4 style={{ color: COLORS.GRAY_M, marginBottom: "35px" }}>
          Start collaborating for free today.
        </h4>
        {accountCreationInstructions && (
          <Markdown value={accountCreationInstructions} />
        )}
      </>
    );
  }

  return (
    <AuthPageContainer
      error={renderError()}
      footer={renderFooter()}
      subtitle={renderSubtitle()}
      minimal={minimal}
      title={`Create a free account with ${siteName}`}
    >
      <Paragraph>
        By creating an account, you agree to the{" "}
        <A external={true} href="/policies/terms">
          Terms of Service
        </A>
        .
      </Paragraph>
      {onCoCalcCom && supportVideoCall ? (
        <Paragraph>
          Do you need more information how {siteName} can be useful for you?{" "}
          <A href={supportVideoCall}>Book a video call</A> and we'll help you
          decide.
        </Paragraph>
      ) : undefined}
      <Divider />
      {!minimal && onCoCalcCom ? (
        <Tags
          setTags={setTags}
          signupReason={signupReason}
          setSignupReason={setSignupReason}
          tags={tags}
          minTags={minTags}
          what={what}
          style={{ width: "880px", maxWidth: "100%", marginTop: "20px" }}
          contact={showContact}
          warning={needsTags}
        />
      ) : undefined}
      <form>
        {issues.reCaptcha ? (
          <Alert
            style={LINE}
            type="error"
            showIcon
            message={issues.reCaptcha}
            description={<>You may have to contact the site administrator.</>}
          />
        ) : undefined}
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
        {requiresToken2 && (
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
        <EmailOrSSO
          email={email}
          setEmail={setEmail}
          signUp={signUp}
          strategies={strategies}
          hideSSO={requiredSSO != null}
        />
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
        {requiredSSO == null && (
          <div style={LINE}>
            <p>Password</p>
            <Input.Password
              style={{ fontSize: "12pt" }}
              value={password}
              placeholder="Password"
              autoComplete="new-password"
              onChange={(e) => setPassword(e.target.value)}
              onPressEnter={signUp}
              maxLength={MAX_PASSWORD_LENGTH}
            />
          </div>
        )}
        {issues.password && (
          <Alert style={LINE} type="error" showIcon message={issues.password} />
        )}
        {requiredSSO == null && (
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
        {requiredSSO == null && (
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
          style={{
            width: "100%",
            marginTop: "15px",
            color:
              !submittable.current || signingUp
                ? COLORS.ANTD_RED_WARN
                : undefined,
          }}
          onClick={signUp}
        >
          {needsTags && tagsSize < minTags
            ? `Select at least ${smallIntegerToEnglishWord(minTags)} ${plural(
                minTags,
                what,
              )}`
            : requiresToken2 && !registrationToken
            ? "Enter the secret registration token"
            : !email
            ? "How will you sign in?"
            : !isValidEmailAddress(email)
            ? "Enter a valid email address above"
            : requiredSSO != null
            ? "You must sign up via SSO"
            : !password || password.length < 6
            ? "Choose password with at least 6 characters"
            : !firstName?.trim()
            ? "Enter your first name above"
            : !lastName?.trim()
            ? "Enter your last name above"
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
    </AuthPageContainer>
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
      <div>
        <p style={{ color: "#444", marginTop: "10px" }}>
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
      {emailSignup ? (
        <p>
          <p>Email address</p>
          <Input
            style={{ fontSize: "12pt" }}
            placeholder="Email address"
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onPressEnter={signUp}
          />
        </p>
      ) : undefined}
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
