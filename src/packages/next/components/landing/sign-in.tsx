import { join } from "path";
import { useCustomize } from "lib/customize";
import basePath from "lib/base-path";
import { CSSProperties, ReactNode } from "react";
import A from "components/misc/A";

interface Props {
  startup?: ReactNode; // customize the button, e.g. "Start Jupyter Now".
  hideFree?: boolean;
}

const STYLE = {
  textAlign: "center",
  padding: "30px 15px 0 15px",
} as CSSProperties;

export default function SignIn({ startup, hideFree }: Props) {
  const { anonymousSignup, siteName, account } = useCustomize();
  if (account != null) {
    return (
      <div style={STYLE}>
        <A
          className="ant-btn"
          href={join(basePath, "projects")}
          external={true}
          style={{ margin: "15px" }}
          title={`Open the ${siteName} app and view your projects`}
        >
          View Your {siteName} Projects...
        </A>
      </div>
    );
  }
  return (
    <div style={STYLE}>
      {/* We use className="ant-btn" instead of an actual Button, because otherwise
            we get a ton of useLayoutEffects due to server-side rendering.*/}
      {anonymousSignup && (
        <a
          className="ant-btn"
          style={{
            backgroundColor: "#5cb85c",
            borderColor: "#4cae4c",
            color: "white",
          }}
          href={join(basePath, "static/app.html?anonymous=jupyter")}
          title={"Try now without creating an account!"}
        >
          Run {startup ?? siteName} Now
        </a>
      )}
      <a
        className="ant-btn"
        href={join(basePath, "static/app.html")}
        style={{ margin: "15px" }}
        title={"Either create a new account or sign into an existing account."}
      >
        Create Account or Sign In
      </a>
      {!hideFree && (
        <>
          <br />
          Start free today. Upgrade later.
        </>
      )}
    </div>
  );
}
