import {
  is_valid_email_address as isValidEmailAddress,
  len,
} from "@cocalc/util/misc";
import { Strategy } from "@cocalc/util/types/sso";
import { Alert, Button, Checkbox, Input } from "antd";
import SquareLogo from "components/logo-square";
import A from "components/misc/A";
import Loading from "components/share/loading";
import apiPost from "lib/api/post";
import useCustomize from "lib/use-customize";
import { CSSProperties, useEffect, useRef, useState } from "react";
import { LOGIN_STYLE } from "./shared";
import SSO, { RequiredSSO, useRequiredSSO } from "./sso";

const LINE: CSSProperties = { margin: "15px 0" } as const;

interface Props {
  strategies?: Strategy[];
  minimal?: boolean; // use a minimal interface with less explanation and instructions (e.g., for embedding in other pages)
  requiresToken?: boolean; // will be determined by API call if not given.
  onSuccess?: () => void; // if given, call after sign up *succeeds*.
}

export default function SignUp({
  strategies,
  requiresToken,
  minimal,
  onSuccess,
}: Props) {
  const {
    anonymousSignup,
    siteName,
    emailSignup,
    accountCreationInstructions,
  } = useCustomize();
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
  }>({});

  const submittable = useRef<boolean>(false);

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

  const [strategies2, setStrategies2] = useState<Strategy[] | undefined>(
    strategies
  );

  useEffect(() => {
    if (strategies2 === undefined) {
      (async () => {
        try {
          setStrategies2(await apiPost("/auth/sso-strategies"));
        } catch (err) {}
      })();
    }
  }, []);

  if (requiresToken2 === undefined || strategies2 === undefined) {
    return <Loading />;
  }

  // based on email: if user has to sign up via SSO, this will tell which strategy to use.
  const requiredSSO = useRequiredSSO(strategies2, email);

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
      const result = await apiPost("/auth/sign-up", {
        terms,
        email,
        password,
        firstName,
        lastName,
        registrationToken,
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

  if (!emailSignup && strategies2.length == 0) {
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
            {anonymousSignup && (
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

  return (
    <div style={{ margin: "30px", minHeight: "50vh" }}>
      {!minimal && (
        <div style={{ textAlign: "center", marginBottom: "15px" }}>
          <SquareLogo
            style={{ width: "100px", height: "100px", marginBottom: "15px" }}
            priority={true}
          />
          <h1>Create a {siteName} Account</h1>
          {accountCreationInstructions}
        </div>
      )}

      <div style={LOGIN_STYLE}>
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
        <form>
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
          {terms && requiresToken2 && (
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
          {terms && (
            <EmailOrSSO
              email={email}
              setEmail={setEmail}
              signUp={signUp}
              strategies={strategies2}
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
          {terms && email && requiredSSO == null && (
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
          {terms && email && requiredSSO == null && password?.length >= 6 && (
            <div style={LINE}>
              <p>First name</p>
              <Input
                style={{ fontSize: "12pt" }}
                placeholder="First name"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                onPressEnter={signUp}
              />
            </div>
          )}
          {terms && email && password && requiredSSO == null && firstName && (
            <div style={LINE}>
              <p>Last name</p>
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
            disabled={!submittable.current}
            type="primary"
            style={{ width: "100%", marginTop: "15px" }}
            onClick={signUp}
          >
            {!terms
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
              : "Sign Up!"}
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
        <SSO
          strategies={strategies}
          size={email ? 24 : undefined}
          style={style}
        />
      </div>
    );
  }

  return (
    <div>
      <p>
        {hideSSO
          ? "Sign up using your single-sign-on provider"
          : strategies.length > 0 && emailSignup
          ? "Sign up using either your email address or a single-sign-on provider."
          : emailSignup
          ? "Enter the email address you will use to sign in."
          : "Sign up using a single sign on provider."}
      </p>
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
