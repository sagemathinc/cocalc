import Link from "next/link";
import { User as IUser } from "lib/types";

interface Props {
  user: IUser;
}

export default function User(props: Props) {
  const { account_id, first_name, last_name } = props.user;
  return (
    <Link href={`/accounts/${account_id}`}>
      <a>
        {first_name} {last_name}
      </a>
    </Link>
  );
}
