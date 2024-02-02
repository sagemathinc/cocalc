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

import { AUTH_WRAPPER_STYLE } from "./shared";

type SelectedView = "sign-in" | "sign-up";

interface InPlaceOrSignUpProps {
  title?: ReactNode;
  why?: ReactNode;
  defaultView?: SelectedView;
  onSuccess?: () => void;
  style?: CSSProperties;
  has_site_license?: boolean;
  publicPathId?: string;
  minimal?: boolean;
}

export default function InPlaceSignInOrUp({
  title="Sign in or sign up",
  defaultView="sign-in",
  why,
  onSuccess,
  style,
  has_site_license,
  publicPathId,
}: InPlaceOrSignUpProps) {
  const router = useRouter();
  const [show, setShow] = useState<SelectedView>(defaultView);

  return (
    <div style={{...style, ...AUTH_WRAPPER_STYLE }}>
      <Divider>
        <Icon name="sign-in" style={{ marginRight: "10px" }} /> {title}
      </Divider>
      {why && (
        <div style={{ fontSize: "13px", marginTop: "8px", padding: "8px" }}>
          Sign in or sign up {why}.
        </div>
      )}
      {show == "sign-up" && (
        <SignUpAuth
          minimal
          showSignIn
          signInAction={() => setShow("sign-in")}
          has_site_license={has_site_license}
          publicPathId={publicPathId}
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
          showSignUp
          signUpAction={() => setShow("sign-up")}
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
