/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
Create an anonymous account.
*/

import { Button } from "antd";
import { useState } from "react";
import {
  GoogleReCaptchaProvider,
  useGoogleReCaptcha,
} from "react-google-recaptcha-v3";

import { len } from "@cocalc/util/misc";
import A from "components/misc/A";
import Loading from "components/share/loading";
import api from "lib/api/post";
import useCustomize from "lib/use-customize";

import AuthPageContainer from "./fragments/auth-page-container";

interface Props {
  minimal?: boolean;
  publicPathId?: string;
  onSuccess: () => void; // if given, call after sign up *succeeds*.
}

export default function Try(props: Props) {
  const { reCaptchaKey } = useCustomize();
  const body = <Try0 {...props} />;
  if (reCaptchaKey == null) {
    return body;
  }
  return (
    <GoogleReCaptchaProvider reCaptchaKey={reCaptchaKey}>
      {body}
    </GoogleReCaptchaProvider>
  );
}

function Try0({ minimal, onSuccess, publicPathId }: Props) {
  const {
    siteName,
    anonymousSignup,
    reCaptchaKey,
    anonymousSignupLicensedShares,
  } = useCustomize();
  const [state, setState] = useState<"wait" | "creating" | "done">("wait");
  const [error, setError] = useState<string>("");
  const { executeRecaptcha } = useGoogleReCaptcha();

  if (!anonymousSignup && !(anonymousSignupLicensedShares && publicPathId)) {
    return (
      <h1 style={{ textAlign: "center", margin: "45px auto" }}>
        Anonymous Trial of {siteName} Not Currently Available
      </h1>
    );
  }

  async function createAnonymousAccount() {
    setState("creating");
    try {
      let reCaptchaToken: undefined | string;
      if (reCaptchaKey) {
        if (!executeRecaptcha) {
          throw Error("Please wait a few seconds, then try again.");
        }
        reCaptchaToken = await executeRecaptcha("anonymous");
      }

      const result = await api("/auth/sign-up", {
        reCaptchaToken,
        publicPathId,
      });
      if (result.issues && len(result.issues) > 0) {
        throw Error(JSON.stringify(result.issues)); // TODO: should not happen, except for captcha error...
      }
      onSuccess?.();
      setState("done");
    } catch (err) {
      setError(err.message);
      setState("wait");
    }
  }

  function renderFooter() {
    return !minimal && (
      <>
        <div>
          Already have an account? <A href="/auth/sign-in">Sign In</A>
        </div>
        <div style={{ marginTop: "15px" }}>
          Need an account? <A href="/auth/sign-up">Sign Up</A>
        </div>
      </>
    );
  }

  return (
    <AuthPageContainer
      error={error}
      footer={renderFooter()}
      minimal={minimal}
      title={`Use ${siteName} Anonymously`}
    >
      <div style={{ margin: "10px 0" }}>
        Use {siteName} <b>without</b>{" "}
        <A href="/auth/sign-up" external={!!minimal}>
          creating an account
        </A>
        !
        <Button
          disabled={state != "wait"}
          shape="round"
          size="large"
          type="primary"
          style={{ width: "100%", marginTop: "20px" }}
          onClick={createAnonymousAccount}
        >
          {state == "creating" ? (
            <Loading>Configuring Anonymous Access...</Loading>
          ) : (
            <>Use {siteName} Anonymously</>
          )}
        </Button>
      </div>
    </AuthPageContainer>
  );
}
