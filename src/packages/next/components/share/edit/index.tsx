/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
When you want to edit an existing public share, here's the flow of what happens.

- If you are a collaborator on the project with the shared document it shows a button to "Open the file in my project" (or something).
- If you are NOT a collaborator on the project there are various states:
  - If you are NOT signed in it gives you the option to:
    - Sign in, then start this flowchart over
    - Sign up, then start this over
    - Create a new project and edit this content.
  - If you are signed in, it gives you these options:
    - Create a new project and copy this content to that project (and it opens the project in a new tab).
    - Copy this content to one of your existing projects.
      - If you select this, then a select an existing projects, and maybe a directory in that project.
      - Project starts and content gets copied
      - Maybe when done get a link and can open that.
- In all cases above, if share comes with a license (i.e., the CUP situation), then that license gets applied to the relevant project... temporarily (?).

*/

import { Icon } from "@cocalc/frontend/components/icon";
import { Button } from "antd";
import { useRouter } from "next/router";
import { useEffect, useState } from "react";
import EditOptions from "./edit-options";

export interface Props {
  id: string;
  path: string;
  url?: string;
  relativePath: string;
  project_id: string;
  image?: string;
  description?: string;
}

export default function Edit({
  id,
  path,
  url,
  relativePath,
  project_id,
  image,
  description,
}: Props) {
  const router = useRouter();
  const [expanded, setExpanded] = useState<boolean>(!!router.query.edit);
  useEffect(() => {
    setExpanded(!!router.query.edit);
  }, [id, path, url, relativePath]);

  return (
    <>
      <Button
        style={{ marginLeft: "-15px" }}
        type="link"
        disabled={expanded}
        onClick={(e) => {
          e.preventDefault();
          setExpanded(true);
        }}
        key="edit"
      >
        <Icon name="pencil" /> Edit...
      </Button>
      {expanded && (
        <EditOptions
          id={id}
          path={path}
          url={url}
          relativePath={relativePath}
          project_id={project_id}
          image={image}
          description={description}
          onClose={() => {
            setExpanded(false);
          }}
        />
      )}
    </>
  );
}
