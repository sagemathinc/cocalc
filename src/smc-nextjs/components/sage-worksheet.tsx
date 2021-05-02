/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { parse_sagews } from "smc-webapp/sagews/parse-sagews";
import { Worksheet } from "smc-webapp/sagews/worksheet";

interface Props {
  content: string;
}

export default function SageWorksheet({ content }: Props) {
  return <Worksheet sagews={parse_sagews(content)} />;
}
