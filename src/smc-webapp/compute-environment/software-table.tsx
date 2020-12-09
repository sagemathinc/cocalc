/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { React } from "../app-framework";
import { Executables } from "./executables";
import { LanguageTable } from "./language-table";

interface Props {
  lang: string;
  version_click: Function;
}

export const SoftwareTable: React.FC<Props> = ({ lang, version_click }) => {
  if (lang === "executables") {
    return <Executables lang={lang} />;
  } else {
    return <LanguageTable lang={lang} version_click={version_click} />;
  }
};
