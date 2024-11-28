import { User as UserAccount } from "@cocalc/frontend/users";
import { r_join } from "@cocalc/frontend/components/r_join";
import { is_array } from "@cocalc/util/misc";

export default function User({ id, ...props }) {
  if (typeof id == "string") {
    return <UserAccount account_id={id} {...props} />;
  } else if (is_array(id)) {
    return r_join(
      id.map((account_id) => <UserAccount account_id={account_id} {...props} />),
      ", ",
    );
  } else {
    return <span>{id}</span>;
  }
}
