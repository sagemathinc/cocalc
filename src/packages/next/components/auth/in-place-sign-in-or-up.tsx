/*
 *  This file is part of CoCalc: Copyright © 2022 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

// TODO: below we need to get the strategies!
// and also requiresToken for SignUp!
import { Icon } from "@cocalc/frontend/components/icon";
import { Divider } from "antd";
import SignInAuth from "components/auth/sign-in";
import SignUpAuth from "components/auth/sign-up";
import { useRouter } from "next/router";
import { CSSProperties, ReactNode, useState } from "react";

interface Props {
  title?: ReactNode;
  why?: ReactNode;
  onSuccess?: () => void;
  style?: CSSProperties;
}

export default function InPlaceSignInOrUp({
  title,
  why,
  onSuccess,
  style,
}: Props) {
  const router = useRouter();
  const [show, setShow] = useState<"sign-in" | "sign-up" | "">("");

  return (
    <div style={{ textAlign: "center", ...style }}>
      <Divider>
        <Icon name="sign-in" style={{ marginRight: "10px" }} /> {title}
      </Divider>
      <a onClick={() => setShow("sign-up")}>Sign Up</a> or{" "}
      <a onClick={() => setShow("sign-in")}>Sign In</a>
      {why == null ? "." : <> {why}.</>}
      <br />
      <br />
      {show == "sign-up" && (
        <SignUpAuth
          minimal
          onSuccess={
            onSuccess ??
            (() =>
              router.push({
                pathname: router.asPath.split("?")[0],
                query: { edit: "true" },
              }))
          }
        />
      )}
      {show == "sign-in" && (
        <SignInAuth
          minimal
          onSuccess={
            onSuccess ??
            (() =>
              router.push({
                pathname: router.asPath.split("?")[0],
                query: { edit: "true" },
              }))
          }
        />
      )}
    </div>
  );
}
