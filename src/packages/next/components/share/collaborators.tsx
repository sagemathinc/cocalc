import User from "./user";
import { ProjectCollaborator } from "lib/api/schema/projects/collaborators/list";

import type { JSX } from "react";

export default function Collaborators({
  collaborators,
}: {
  collaborators: ProjectCollaborator[];
}) {
  const v: JSX.Element[] = [];
  for (const user of collaborators ?? []) {
    v.push(<User key={user.account_id} {...user} />);
    v.push(<span key={user.account_id + ","}>{", "}&nbsp;&nbsp;</span>);
  }
  v.pop(); // discard last comma.
  return <>{v}</>;
}
