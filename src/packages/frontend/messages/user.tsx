import { User as UserAccount } from "@cocalc/frontend/users";
import { capitalize } from "@cocalc/util/misc";

export default function User({ id, type, ...props }) {
  if (type == "account") {
    return <UserAccount account_id={id} {...props} />;
  } else {
    return <div>{capitalize(type)}</div>;
  }
}
