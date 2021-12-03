import AccountName from "./account/name";
import Email from "./account/email";
import Avatar from "./account/avatar";
import Link from "./account/link";
import SSHKeys from "./account/ssh";
import APIKey from "./account/api";
import DeleteAccount from "./account/delete-account";
import SignOut from "./account/sign-out";

interface Props {
  main: string;
  sub: string;
}

const Components = {
  account: {
    name: AccountName,
    email: Email,
    avatar: Avatar,
    link: Link,
    ssh: SSHKeys,
    api: APIKey,
    delete: DeleteAccount,
    "sign-out": SignOut,
    delete: DeleteAccount,
  },
};

export default function Config({ main, sub }: Props) {
  const C = Components[main]?.[sub];
  if (C != null) {
    return <C />;
  }
  return <>TODO: Configure not yet implemented.</>;
}
