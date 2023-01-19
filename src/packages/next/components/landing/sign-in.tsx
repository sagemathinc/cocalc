/*
 *  This file is part of CoCalc: Copyright © 2021 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { Button } from "antd";
import { Paragraph } from "components/misc";
import A from "components/misc/A";
import basePath from "lib/base-path";
import { useCustomize } from "lib/customize";
import { useRouter } from "next/router";
import { join } from "path";
import { CSSProperties, ReactNode } from "react";

interface Props {
  startup?: ReactNode; // customize the button, e.g. "Start Jupyter Now".
  hideFree?: boolean;
  style?: React.CSSProperties;
}

const STYLE: CSSProperties = {
  textAlign: "center",
  padding: "30px 15px 15px 15px",
} as const;

export default function SignIn({ startup, hideFree, style }: Props) {
  const { anonymousSignup, siteName, account } = useCustomize();
  const router = useRouter();
  if (account != null) {
    return (
      <Paragraph style={{ ...STYLE, ...style }}>
        <A
          className="ant-btn"
          href={join(basePath, "projects")}
          external={true}
          style={{ margin: "15px", fontSize: "14pt" }}
          title={`Open the ${siteName} app and view your projects`}
        >
          View Your {siteName} Projects...
        </A>
      </Paragraph>
    );
  }
  return (
    <Paragraph style={STYLE}>
      {/* We use className="ant-btn" instead of an actual Button, because otherwise
            we get a ton of useLayoutEffects due to server-side rendering.*/}
      {anonymousSignup && (
        <Button
          size="large"
          type="primary"
          style={{ margin: "10px" }}
          title={"Try now without creating an account!"}
          onClick={() => router.push("/auth/try")}
        >
          Try&nbsp;{startup ?? siteName}&nbsp;Now
        </Button>
      )}
      <Button
        size="large"
        style={{ margin: "10px" }}
        title={"Either create a new account or sign into an existing account."}
        onClick={() => router.push("/auth/sign-in")}
      >
        Sign In
      </Button>
      <Button
        size="large"
        style={{ margin: "10px" }}
        title={"Create a new account."}
        onClick={() => router.push("/auth/sign-up")}
      >
        Sign Up
      </Button>
      {!hideFree && (
        <div style={{ padding: "15px 0 0 0" }}>
          Start free today. Upgrade later.
        </div>
      )}
    </Paragraph>
  );
}
