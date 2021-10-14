import Link from "next/link";
import { User as IUser } from "lib/share/types";
import { trunc } from "lib/share/util";
import Avatar from "components/account/avatar";

interface Props {
  account_id: string;
  first_name?: string;
  last_name?: string;
}

export default function User({ account_id, first_name, last_name }: Props) {
  return (
    <Link href={`/share/accounts/${account_id}`}>
      <a>
        <Avatar account_id={account_id} style={{ marginRight: "5px" }} />
        {trunc(`${first_name} ${last_name}`, 50)}
      </a>
    </Link>
  );
}
