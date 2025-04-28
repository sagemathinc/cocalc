/*
EXAMPLE:

~/cocalc/src/packages/backend/nats$ n
Welcome to Node.js v18.17.1.
Type ".help" for more information.
> a = require('@cocalc/backend/nats/nkeys')
{
  publicKey: [Function: publicKey],
  createPrivateKey: [Function: createPrivateKey]
}
> a.createPrivateKey('user')
'SUACDK5OBWPWYKHAZSKNO4IC3UXDYWD4LLPOVMM3DEY6Z7UXJQB3CK63B4'
> seed = a.createPrivateKey('user')
'SUACLFDTUS353H4ITLDAFQWYA43IAP2L7LGZ5XDEEARMJ4KNPHUWDKDUFQ'
> a.publicKey(seed)
'UCBWG2NENI2VLZRMXKAQOZVKVVPA5GBUY2G7KGEDJRDWFSQ5VV3P7VYD'
*/

import * as nkeys from "@nats-io/nkeys";
import { capitalize } from "@cocalc/util/misc";

export function publicKey(seed: string): string {
  const t = new TextEncoder();
  let kp;
  if (seed.startsWith("SX")) {
    kp = nkeys.fromCurveSeed(t.encode(seed));
  } else {
    kp = nkeys.fromSeed(t.encode(seed));
  }
  return kp.getPublicKey();
}

type KeyType =
  | "account"
  | "cluster"
  | "curve"
  | "operator"
  | "pair"
  | "server"
  | "user";

export function createPrivateKey(type: KeyType): string {
  const kp = nkeys[`create${capitalize(type)}`]();
  const t = new TextDecoder();
  if (type == "curve") {
    return t.decode(kp.getSeed());
  }
  return t.decode(kp.seed);
}
