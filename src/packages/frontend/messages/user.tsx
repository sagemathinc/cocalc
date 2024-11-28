import { User as UserAccount } from "@cocalc/frontend/users";

export default function User({ id, ...props }) {
  return <UserAccount account_id={id} {...props} />;
}
