import { r_join } from "@cocalc/frontend/components/r_join";
import { User as UserAccount } from "@cocalc/frontend/users";
import { is_array } from "@cocalc/util/misc";
import { getBitField } from "./util";

export default function User({ id, message, ...props }) {
  if (typeof id == "string") {
    return <UserAccount account_id={id} {...props} />;
  } else if (is_array(id)) {
    const v: any[] = [];
    for (const account_id of new Set(id)) {
      let user;
      if (message != null && !getBitField(message, "read", account_id)) {
        user = (
          <b key={account_id}>
            <UserAccount account_id={account_id} {...props} />
          </b>
        );
      } else {
        user = (
          <UserAccount key={account_id} account_id={account_id} {...props} />
        );
      }
      v.push(user);
    }
    return r_join(v, ", ");
  } else {
    return <span>{id}</span>;
  }
}
