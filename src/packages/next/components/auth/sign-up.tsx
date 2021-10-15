import { Alert, Button, Checkbox, Input } from "antd";
import { CSSProperties, useRef, useState } from "react";
import SquareLogo from "components/logo-square";
import useCustomize from "lib/use-customize";
import A from "components/misc/A";
import {
  len,
  is_valid_email_address as isValidEmailAddress,
} from "@cocalc/util/misc";
import apiPost from "lib/api/post";
import SSO from "./sso";
import { LOGIN_STYLE } from "./shared";
import { useRouter } from "next/router";

const LINE = { marginBottom: "15px" } as CSSProperties;

export default function SignUp({ strategies }) {
  const router = useRouter();
  const { siteName } = useCustomize();
  const [terms, setTerms] = useState<boolean>(false);
  const [email, setEmail] = useState<string>("");
  const [password, setPassword] = useState<string>("");
  const [firstName, setFirstName] = useState<string>("");
  const [lastName, setLastName] = useState<string>("");
  const [signingUp, setSigningUp] = useState<boolean>(false);
  const [issues, setIssues] = useState<{
    email?: string;
    password?: string;
    terms?: string;
    error?: string;
  }>({});

  const submittable = useRef<boolean>(false);

  submittable.current = !!(
    terms &&
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
      });
      if (result.issues && len(result.issues) > 0) {
        setIssues(result.issues);
      } else {
        router.push("/");
      }
    } catch (err) {
      setIssues({ error: `${err}` });
    } finally {
      setSigningUp(false);
    }
  }

  return (
    <div style={{ padding: "0 15px" }}>
      <div style={{ textAlign: "center", marginBottom: "15px" }}>
        <SquareLogo style={{ width: "100px", height: "100px" }} />
        <h1>Create a {siteName} Account</h1>
      </div>

      <div style={LOGIN_STYLE}>
        <Checkbox
          style={{
            marginTop: "10px",
            marginBottom: terms ? "10px" : undefined,
            fontSize: "12pt",
            color: "#666",
          }}
          onChange={(e) => setTerms(e.target.checked)}
        >
          I agree to the{" "}
          <A external={true} href="/policies/terms">
            Terms of Service
          </A>{" "}
          and to receive support emails from CoCalc.
        </Checkbox>
        <form>
          {terms && (
            <EmailOrSSO
              email={email}
              setEmail={setEmail}
              signUp={signUp}
              strategies={strategies}
            />
          )}
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
          {terms && email && (
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
          {terms && email && password?.length >= 6 && (
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
          {terms && email && password && firstName && (
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
              : !email
              ? "How will you sign in?"
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

      <div
        style={{
          ...LOGIN_STYLE,
          backgroundColor: "white",
          marginTop: "30px",
          marginBottom: "30px",
        }}
      >
        <p>
          Already have an account? <A href="/auth/sign-in">Sign In</A>
        </p>
        Don't want to provide any information?
        <br />
        <A href="/auth/try">Try {siteName} without creating an account.</A>
      </div>
    </div>
  );
}

function EmailOrSSO({ email, setEmail, signUp, strategies }) {
  return (
    <div>
      <p>{strategies.length > 0 ? "Sign up using either your email address or a single sign on provider." : "Enter the email address you will use to sign in."}</p>
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
      {!email && (
        <div style={{ textAlign: "center" }}>
          <SSO strategies={strategies} />
        </div>
      )}
    </div>
  );
}
