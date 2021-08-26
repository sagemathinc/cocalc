import Link from "next/link";
import { User as IUser } from "lib/types";
import { trunc } from "lib/util";

interface Props {
  user: IUser;
}

export default function User(props: Props) {
  const { account_id, first_name, last_name } = props.user;
  return (
    <Link href={`/accounts/${account_id}`}>
      <a>{trunc(`${first_name} ${last_name}`, 50)}</a>
    </Link>
  );
}
