import { Button, Checkbox, Input } from "antd";
import { CSSProperties, useState } from "react";
import SquareLogo from "components/logo-square";
import useCustomize from "lib/use-customize";
import A from "components/misc/A";
import SSO from "./sso";
import { LOGIN_STYLE } from "./shared";

const LINE = { marginBottom: "15px" } as CSSProperties;

export default function SignUp() {
  const { siteName } = useCustomize();
  const [terms, setTerms] = useState<boolean>(false);
  const [email, setEmail] = useState<string>("");
  const [password, setPassword] = useState<string>("");
  const [firstName, setFirstName] = useState<string>("");
  const [lastName, setLastName] = useState<string>("");

  function signUp() {
    console.log("signUp", { email, password, firstName, lastName });
  }

  return (
    <div style={{ padding: "0 15px" }}>
      <div style={{ textAlign: "center", marginBottom: "15px" }}>
        <SquareLogo style={{ width: "100px", height: "100px" }} />
        <h1>Create a {siteName} Account</h1>
      </div>

      <div style={LOGIN_STYLE}>
        <p style={{ marginTop: "10px" }}>
          <Checkbox
            style={{ marginRight: "10px", fontSize: "12pt", color: "#666" }}
            onChange={(e) => setTerms(e.target.checked)}
          >
            I agree to the <A href="/policies/terms">Terms of Service</A> and to
            receive support emails from CoCalc.
          </Checkbox>
        </p>
        <form>
          {terms && <EmailOrSSO email={email} setEmail={setEmail} />}
          {terms && email && (
            <div style={LINE}>
              <p>Password</p>
              <Input.Password
                value={password}
                placeholder="Password"
                autoComplete="new-password"
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
          )}
          {terms && email && password && (
            <div style={LINE}>
              <p>First name</p>
              <Input
                placeholder="First name"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
              />
            </div>
          )}
          {terms && email && password && firstName && (
            <div style={LINE}>
              <p>Last name</p>
              <Input
                placeholder="Last name"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
              />
            </div>
          )}
        </form>
        {terms && email && (
          <div style={LINE}>
            <Button
              shape="round"
              size="large"
              disabled={!(terms && email && password && firstName && lastName)}
              type="primary"
              style={{ width: "100%" }}
              onClick={signUp}
            >
              Sign Up{" "}
              {!password
                ? "(enter a password)"
                : !firstName
                ? "(enter your first name)"
                : !lastName
                ? "(enter your last name)"
                : ""}
            </Button>
          </div>
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
          Already have an account? <A href="/sign-in">Sign In</A>
        </p>
        Don't want to provide any information?
        <br />
        <A href="/try">Try {siteName} without creating an account.</A>
      </div>
    </div>
  );
}

function EmailOrSSO({ email, setEmail }) {
  return (
    <div>
      <p>
        Use either your email address, or login via <a>Google</a>, <a>Github</a>
        , <a>Twitter</a>, or <a>Facebook</a>.
      </p>
      <p>
        <Input
          placeholder="Email address"
          autoComplete="username"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </p>
      {!email && (
        <div style={{ textAlign: "center" }}>
          <SSO />
        </div>
      )}
    </div>
  );
}
