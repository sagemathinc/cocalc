import { components } from "./register";

import "./search/component";

import "./account/name";
import "./account/email";
import "./account/password";
import "./account/avatar";
import "./account/link";

// Maybe ssh doesn't belong here.
// import "./account/ssh";

import "./account/api";
import "./account/delete-account";
import "./account/sign-out";

import "./editor/appearance";
import "./editor/jupyter";
import "./editor/terminal";
import "./editor/options";
import "./editor/keyboard";

import "./system/appearance";
import "./system/behavior";
import "./system/listings";

// This maybe doesn't belong here.

// import "./licenses/buy";
// import "./licenses/licensed";
// import "./licenses/manage";

// import "./purchases/payment";
// import "./purchases/invoices-and-receipts";
// import "./purchases/subscriptions";

interface Props {
  main: string;
  sub: string;
}

export default function Config({ main, sub }: Props) {
  const C = components[main]?.[sub];
  if (C != null) {
    return <C />;
  }
  return null;
}
