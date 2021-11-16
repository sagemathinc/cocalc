import { join } from "path";
import { useState } from "react";
import { Card, Divider } from "antd";
import { useRouter } from "next/router";
import { Icon } from "@cocalc/frontend/components/icon";
import useCustomize from "lib/use-customize";
import SignInAuth from "components/auth/sign-in";
import SignUpAuth from "components/auth/sign-up";
import OpenDirectly from "./open-directly";
import OpenAnonymously from "./open-anonymously";
import ChooseProject from "./choose-project";
import { Props } from "./index";

interface EditOptionsProps extends Props {
  onClose: () => void;
}

export default function EditOptions({
  id,
  path,
  relativePath,
  project_id,
  image,
  onClose,
  description,
}: EditOptionsProps) {
  const { account } = useCustomize();
  return (
    <Card
      style={{ margin: "30px 0" }}
      title={
        <>
          <div style={{ float: "right", cursor: "pointer" }} onClick={onClose}>
            <Icon name="times-circle" />
          </div>
          <Icon style={{ marginRight: "10px" }} name="pencil" /> Where to edit{" "}
          <b>{join(path, relativePath)}</b>?
        </>
      }
    >
      {account?.account_id != null && (
        <SignedInOptions
          id={id}
          path={path}
          relativePath={relativePath}
          project_id={project_id}
          image={image}
          description={description}
        />
      )}
      {account?.account_id == null && <NotSignedInOptions />}
      <br />
    </Card>
  );
}

function SignedInOptions({
  id,
  path,
  relativePath,
  project_id,
  image,
  description,
}) {
  const { isCollaborator } = useCustomize();
  return isCollaborator ? (
    <OpenDirectly
      id={id}
      project_id={project_id}
      path={path}
      relativePath={relativePath}
    />
  ) : (
    <ChooseProject
      id={id}
      src_project_id={project_id}
      path={path}
      relativePath={relativePath}
      image={image}
      description={description ? description : path ? path : relativePath}
    />
  );
}

function NotSignedInOptions() {
  const { anonymousSignup } = useCustomize();
  return (
    <div>
      <SignIn />
      {anonymousSignup && <OpenAnonymously />}
    </div>
  );
}

// TODO: below we need to get the strategies!
// and also requiresToken for SignUp!

function SignIn() {
  const router = useRouter();
  const [show, setShow] = useState<"sign-in" | "sign-up" | "">("");
  return (
    <div style={{ textAlign: "center" }}>
      <Divider>
        <Icon name="sign-in" style={{ marginRight: "10px" }} /> Choose Project
      </Divider>
      <a onClick={() => setShow("sign-in")}>Sign In</a> or{" "}
      <a onClick={() => setShow("sign-up")}>Sign Up</a> to edit in one of your
      projects.
      <br />
      <br />
      {show == "sign-in" && (
        <SignInAuth
          strategies={[]}
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
          strategies={[]}
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
