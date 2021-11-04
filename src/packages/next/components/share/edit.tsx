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
import { Button } from "antd";
import useCustomize from "lib/use-customize";
//import editURL from "lib/share/edit-url";
// import ExternalLink from "./external-link";
// href={editURL({ id, path, dns })}

interface Props {
  id: string;
  path: string;
  project_id: string;
}

export default function Edit({ id, path, project_id }: Props) {
  //const { dns } = useCustomize();
  const [expanded, setExpanded] = useState<boolean>(false);

  return (
    <div>
      <Button
        disabled={expanded}
        onClick={(e) => {
          e.preventDefault();
          setExpanded(!expanded);
        }}
        key="edit"
      >
        Edit...
      </Button>
      {expanded && (
        <EditOptions
          id={id}
          path={path}
          project_id={project_id}
          onClose={() => setExpanded(false)}
        />
      )}
    </div>
  );
}

interface EditProps extends Props {
  onClose: () => void;
}

function EditOptions({ id, path, project_id, onClose }: EditProps) {
  const { account } = useCustomize();
  return (
    <div>
      {account?.account_id != null && (
        <SignedInOptions
          account_id={account.account_id}
          id={id}
          path={path}
          project_id={project_id}
        />
      )}
      {account?.account_id == null && <AnonymousOptions id={id} path={path} />}
      <br />
      <Button onClick={onClose}>Close</Button>
    </div>
  );
}

function SignedInOptions({ account_id, id, path, project_id }) {
  const { isCollaborator } = useCustomize();
  return <>{isCollaborator ? "collaborator" : "noncollab"}</>;
}

function AnonymousOptions({ id, path }) {
  return <>Anonymous</>;
}
