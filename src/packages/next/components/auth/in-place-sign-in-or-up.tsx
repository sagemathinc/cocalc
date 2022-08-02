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
import { ReactNode, useState } from "react";

interface Props {
  title: ReactNode;
  why?: ReactNode;
  onSuccess?: () => void;
}

export default function InPlaceSignInOrUp(props: Props) {
  const { title, why, onSuccess } = props;
  const router = useRouter();
  const [show, setShow] = useState<"sign-in" | "sign-up" | "">("");

  return (
    <div style={{ textAlign: "center" }}>
      <Divider>
        <Icon name="sign-in" style={{ marginRight: "10px" }} /> {title}
      </Divider>
      <a onClick={() => setShow("sign-in")}>Sign In</a> or{" "}
      <a onClick={() => setShow("sign-up")}>Sign Up</a>
      {why == null ? "." : <>{why}.</>}
      <br />
      <br />
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
    </div>
  );
}
