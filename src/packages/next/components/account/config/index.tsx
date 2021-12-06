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
