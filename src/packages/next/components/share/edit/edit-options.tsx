import { join } from "path";
import { Card } from "antd";
import { Icon } from "@cocalc/frontend/components/icon";
import useCustomize from "lib/use-customize";
import OpenDirectly from "./open-directly";
import OpenAnonymously from "./open-anonymously";
import ChooseProject from "./choose-project";
import { Props } from "./index";
import InPlaceSignInOrUp from "components/auth/in-place-sign-in-or-up";

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
      <InPlaceSignInOrUp
        title="Choose Project"
        why="to edit in one of your projects"
      />
      {anonymousSignup && <OpenAnonymously />}
    </div>
  );
}
