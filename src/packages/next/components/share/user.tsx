import Link from "next/link";
import { User as IUser } from "lib/share/types";
import { trunc } from "lib/share/util";
import Avatar from "components/account/avatar";

interface Props {
  user: IUser;
}

export default function User(props: Props) {
  const { account_id, first_name, last_name } = props.user;
  return (
    <Link href={`/share/accounts/${account_id}`}>
      <a>
        <Avatar account_id={account_id} style={{marginRight:'5px'}} />
        {trunc(`${first_name} ${last_name}`, 50)}
      </a>
    </Link>
  );
}
