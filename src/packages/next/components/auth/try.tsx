/*
Create an anonymous account.
*/

import { useState } from "react";
import { Alert, Button } from "antd";
import SquareLogo from "components/logo-square";
import useCustomize from "lib/use-customize";
import { LOGIN_STYLE } from "./shared";
import A from "components/misc/A";
import api from "lib/api/post";
import { len } from "@cocalc/util/misc";
import Loading from "components/share/loading";

interface Props {
  minimal?: boolean;
  onSuccess: () => void; // if given, call after sign up *succeeds*.
}

export default function Try({ minimal, onSuccess }: Props) {
  const { siteName, anonymousSignup } = useCustomize();
  const [state, setState] = useState<"wait" | "creating" | "done">("wait");
  const [error, setError] = useState<string>("");

  if (!anonymousSignup) {
    return (
      <h1 style={{ textAlign: "center", margin: "45px auto" }}>
        Anonymous Trial of {siteName} Not Currently Available
      </h1>
    );
  }

  async function createAnonymousAccount() {
    setState("creating");
    try {
      const result = await api("/auth/sign-up", {});
      if (result.issues && len(result.issues) > 0) {
        throw Error(JSON.stringify(result.issues)); // should not happen
      }
      onSuccess?.();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div style={{ margin: "30px", minHeight: "50vh" }}>
      {!minimal && (
        <div style={{ textAlign: "center", marginBottom: "15px" }}>
          <SquareLogo
            style={{ width: "100px", height: "100px", marginBottom: "15px" }}
          />
          <h1>Use {siteName} Anonymously</h1>
        </div>
      )}

      <div style={LOGIN_STYLE}>
        {error && <Alert type="error" message={error} showIcon />}
        Try {siteName} <b>without</b>{" "}
        <A href="/auth/sign-up" external={!!minimal}>
          creating an account
        </A>{" "}
        or{" "}
        <A href="/auth/sign-in" external={!!minimal}>
          signing in
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
            <Loading>Creating Anonymous Account...</Loading>
          ) : (
            <>Use {siteName} Anonymously</>
          )}
        </Button>
      </div>
      {!minimal && (
        <div
          style={{
            ...LOGIN_STYLE,
            backgroundColor: "white",
            margin: "30px auto",
            padding: "15px",
          }}
        >
          Already have an account? <A href="/auth/sign-in">Sign In</A>
          <div style={{ marginTop: "15px" }}>
            Need an account? <A href="/auth/sign-up">Sign Up</A>
          </div>
        </div>
      )}
    </div>
  );
}
