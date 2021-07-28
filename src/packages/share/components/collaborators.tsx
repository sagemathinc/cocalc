import User from "./user";
import { User as IUser } from "lib/types";

export default function Collaborators({
  collaborators,
}: {
  collaborators: IUser[];
}) {
  const v: JSX.Element[] = [];
  for (const user of collaborators ?? []) {
    v.push(<User key={user.account_id} user={user} />);
    v.push(<span key={user.account_id+','}>{", "}</span>);
  }
  v.pop(); // discard last comma.
  return <>{v}</>;
}
