/*
 *  This file is part of CoCalc: Copyright © 2022 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

// TODO: below we need to get the strategies!
// and also requiresToken for SignUp!
import { Icon } from "@cocalc/frontend/components/icon";
import { enableForceConsent } from "@cocalc/frontend/cookie-consent";
import { Divider } from "antd";
import SignInAuth from "components/auth/sign-in";
import SignUpAuth from "components/auth/sign-up";
import useCustomize from "lib/use-customize";
import { useRouter } from "next/router";
import { CSSProperties, ReactNode, useEffect, useState } from "react";

import { AUTH_WRAPPER_STYLE } from "./shared";

type SelectedView = "sign-in" | "sign-up" | "compact";

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
  title = "Sign in or sign up",
  defaultView = "compact",
  why,
  onSuccess,
  style,
  has_site_license,
  publicPathId,
}: InPlaceOrSignUpProps) {
  const router = useRouter();
  const { cookieBannerEnabled } = useCustomize();
  const [show, setShow] = useState<SelectedView>(defaultView);

  // The in-place sign-in/up panel mounts on billing, voucher, share and
  // similar Next.js pages whose route doesn't match the `_app.tsx`
  // mandatory-route regex, and whose default `onSuccess` keeps the user
  // on the same Next page rather than routing into the SPA. The SPA's
  // own force-consent fallback therefore never fires for these flows, so
  // we replicate it here: as long as the banner is admin-enabled and the
  // panel is on screen, enable the page-dim overlay until the user
  // accepts. The helper is a no-op when consent already exists.
  useEffect(() => {
    if (!cookieBannerEnabled) return;
    return enableForceConsent();
  }, [cookieBannerEnabled]);

  return (
    <div style={{ ...style, ...AUTH_WRAPPER_STYLE }}>
      <Divider>
        <Icon name="sign-in" style={{ marginRight: "10px" }} /> {title}
      </Divider>
      <div style={{ fontSize: "11pt", marginTop: "8px", padding: "8px" }}>
        <a onClick={() => setShow("sign-in")}>Sign In</a> {" or "}
        <a onClick={() => setShow("sign-up")}>Sign Up</a>
        {why ? ` ${why}` : ""}.
      </div>
      {show === "sign-up" && (
        <SignUpAuth
          minimal
          requireTags={false}
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
      {show === "sign-in" && (
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
