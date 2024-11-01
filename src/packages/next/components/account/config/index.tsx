import { components } from "./register";

import "./search/component";

import "./account/name";
import "./account/email";
import "./account/password";
import "./account/avatar";
import "./account/sso";

import "./account/api";
import "./account/delete-account";
import "./account/sign-out";

import "./editor/appearance";
import "./editor/jupyter";
import "./editor/terminal";
import "./editor/options";

import "./system/appearance";
import "./system/behavior";
import "./system/listings";
import "./system/ai";

interface Props {
  main: string;
  sub: string;
}

export default function Config({ main, sub }: Props) {
  const C = components[main]?.[sub] as any;
  if (C != null) {
    return <C />;
  }
  return null;
}
