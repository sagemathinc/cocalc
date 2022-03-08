/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

interface Props {
  license: string;
}
export default function License({ license }: Props) {
  // TODO: make this more useful later...
  return <span>{license ? license.toUpperCase() : "none"}</span>;
}
