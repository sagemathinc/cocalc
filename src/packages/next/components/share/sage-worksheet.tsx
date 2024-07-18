/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { parse_sagews } from "@cocalc/frontend/sagews/parse-sagews";
import Worksheet from "@cocalc/frontend/sagews/worksheet";

interface Props {
  content: string;
}

export default function SageWorksheet({ content }: Props) {
  return <Worksheet sagews={parse_sagews(content)} />;
}
