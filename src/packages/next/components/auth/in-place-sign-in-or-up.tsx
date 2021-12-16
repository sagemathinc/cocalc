// TODO: below we need to get the strategies!
// and also requiresToken for SignUp!
import SignInAuth from "components/auth/sign-in";
import SignUpAuth from "components/auth/sign-up";
import { useRouter } from "next/router";
import { useState, ReactNode } from "react";
import { Divider } from "antd";
import { Icon } from "@cocalc/frontend/components/icon";

interface Props {
  title: ReactNode;
  why: ReactNode;
}

export default function InPlaceSignInOrUp({ title, why }: Props) {
  const router = useRouter();
  const [show, setShow] = useState<"sign-in" | "sign-up" | "">("");

  return (
    <div style={{ textAlign: "center" }}>
      <Divider>
        <Icon name="sign-in" style={{ marginRight: "10px" }} /> {title}
      </Divider>
      <a onClick={() => setShow("sign-in")}>Sign In</a> or{" "}
      <a onClick={() => setShow("sign-up")}>Sign Up</a> {why}.
      <br />
      <br />
      {show == "sign-in" && (
        <SignInAuth
          minimal
          onSuccess={() =>
            router.push({
              pathname: router.asPath.split("?")[0],
              query: { edit: "true" },
            })
          }
        />
      )}
      {show == "sign-up" && (
        <SignUpAuth
          minimal
          onSuccess={() =>
            router.push({
              pathname: router.asPath.split("?")[0],
              query: { edit: "true" },
            })
          }
        />
      )}
    </div>
  );
}
