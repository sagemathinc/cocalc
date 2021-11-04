/*
When you want to edit an existing public share, here's the flow of what happens.

- If you are a collaborator on the project with the shared document it shows a button to "Open the file in my project" (or something).
- If you are NOT a collaborator on the project there are various states:
  - If you are NOT signed in it gives you the option to:
    - Sign in, then start this flowchart over
    - Sign up, then start this over
    - Create a new anonymous project and anonymously edit this content.
  - If you are signed in, it gives you these options:
    - Create a new project and copy this content to that project (and it opens the project in a new tab).
    - Copy this content to one of your existing projects.
      - If you select this, then a select an existing projects, and maybe a directory in that project.
      - Project starts and content gets copied
      - Maybe when done get a link and can open that.
- In all cases above, if share comes with a license (i.e., the CUP situation), then that license gets applied to the relevant project... temporarily (?).

*/

import { useState } from "react";
import { Button, Card, Checkbox, Divider } from "antd";
import { Icon } from "@cocalc/frontend/components/icon";
import useCustomize from "lib/use-customize";
import A from "components/misc/A";
import editURL from "lib/share/edit-url";

interface Props {
  id: string;
  path: string;
  project_id: string;
}

export default function Edit({ id, path, project_id }: Props) {
  const [expanded, setExpanded] = useState<boolean>(false);

  return (
    <span>
      <Button
        disabled={expanded}
        onClick={(e) => {
          e.preventDefault();
          setExpanded(!expanded);
        }}
        key="edit"
        size="small"
      >
        <Icon name="pencil" /> Edit...
      </Button>
      {expanded && (
        <EditOptions
          id={id}
          path={path}
          project_id={project_id}
          onClose={() => setExpanded(false)}
        />
      )}
    </span>
  );
}

interface EditProps extends Props {
  onClose: () => void;
}

function EditOptions({ id, path, project_id, onClose }: EditProps) {
  const { account } = useCustomize();
  return (
    <Card
      style={{ margin: "30px 10%" }}
      title={
        <>
          <div style={{ float: "right", cursor: "pointer" }} onClick={onClose}>
            <Icon name="times-circle" />
          </div>
          <Icon style={{ marginRight: "10px" }} name="pencil" /> Where to edit{" "}
          {path}?
        </>
      }
    >
      {account?.account_id != null && (
        <SignedInOptions id={id} path={path} project_id={project_id} />
      )}
      {account?.account_id == null && (
        <NotSignedInOptions id={id} path={path} />
      )}
      <br />
    </Card>
  );
}

function SignedInOptions({ id, path, project_id }) {
  const { isCollaborator } = useCustomize();
  return isCollaborator ? (
    <OpenDirectly project_id={project_id} path={path} />
  ) : (
    <CopyToProject id={id} path={path} />
  );
}

function OpenDirectly({
  project_id,
  path,
}: {
  project_id: string;
  path: string;
}) {
  const { dns } = useCustomize();
  const url = dns + project_id + "/" + path;
  return (
    <div>
      You are signed in as a collaborator on{" "}
      <A href={"bar"} external>
        the project
      </A>{" "}
      that contains{" "}
      <A href={"foo"} external>
        this document
      </A>
      .
    </div>
  );
}

function CopyToProject({ id, path }) {
  return (
    <div>
      Create New Project...
      <br />
      Project1
      <br />
      Project2
      <br />
      Project3
      <br />
    </div>
  );
}

function NotSignedInOptions({ id, path }) {
  return (
    <div>
      <SignIn />
      <OpenAnonymously id={id} path={path} />
    </div>
  );
}

function SignIn() {
  return (
    <div>
      <Divider>
        <Icon name="sign-in" style={{ marginRight: "10px" }} /> Your Project
      </Divider>
      <A>Sign In</A> or <A>Sign Up</A> to edit this in one of your projects.
    </div>
  );
}

function OpenAnonymously({ id, path }) {
  const { dns } = useCustomize();
  return (
    <div>
      <Divider>
        <Icon name="mask" style={{ marginRight: "10px" }} /> Anonymously
      </Divider>
      Alternatively, with{" "}
      <A href={editURL({ id, path, dns })}>
        one click you can edit anonymously without signing up
      </A>
      ! Sign up later from your anonymous session without losing work.
    </div>
  );
}


