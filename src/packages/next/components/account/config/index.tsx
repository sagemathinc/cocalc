import { components } from "./register";

import "./search/component";

import "./account/name";
import "./account/email";
import "./account/avatar";
import "./account/link";
import "./account/ssh";
import "./account/api";
import "./account/delete-account";
import "./account/sign-out";

/*{
  search: {
    input: Search,
  },
  account: {
    name: AccountName,
    avatar: Avatar,
    link: Link,
    ssh: SSHKeys,
    api: APIKey,
    delete: DeleteAccount,
    "sign-out": SignOut,
  },
};
*/

/*
// Import all the components, which fills in the Components structure above, and also
// the search data.
import AccountName from "./account/name";
import "./account/email";
import Avatar from "./account/avatar";
import Link from "./account/link";
import SSHKeys from "./account/ssh";
import APIKey from "./account/api";
import DeleteAccount from "./account/delete-account";
import SignOut from "./account/sign-out";

import Search from "./search/component";
*/

interface Props {
  main: string;
  sub: string;
}

export default function Config({ main, sub }: Props) {
  const C = components[main]?.[sub];
  if (C != null) {
    return <C />;
  }
  return <>TODO: Configure not yet implemented.</>;
}
