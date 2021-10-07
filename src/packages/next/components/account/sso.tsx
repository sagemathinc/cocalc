import { CSSProperties } from "react";
import { Icon } from "@cocalc/frontend/components/icon";

export default function SSO() {
  return (
    <div>
      <Google /> <GitHub /> <Twitter /> <Facebook />
    </div>
  );
}

const STYLE = {
  fontSize: "42px",
  color: "white",
  margin: "0 2px",
} as CSSProperties;

function Facebook() {
  return (
    <a href="" title={"Sign in using Facebook"}>
      <Icon name="facebook" style={{ ...STYLE, backgroundColor: "#428bca" }} />
    </a>
  );
}

function GitHub() {
  return (
    <a href="" title={"Sign in using GitHub"}>
      <Icon name="github" style={{ ...STYLE, backgroundColor: "black" }} />
    </a>
  );
}

function Google() {
  return (
    <a href="" title={"Sign in using Google"}>
      <Icon
        name="google"
        style={{ ...STYLE, backgroundColor: "rgb(220, 72, 57)" }}
      />
    </a>
  );
}

function Twitter() {
  return (
    <a href="" title={"Sign in using Twitter"}>
      <Icon
        name="twitter"
        style={{ ...STYLE, backgroundColor: "rgb(85, 172, 238)" }}
      />
    </a>
  );
}
