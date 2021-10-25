/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import React from "react";
import openSupport from "./open";

interface Props {
  text?: string;
}

function show(evt) {
  evt.preventDefault();
  openSupport();
}

export const ShowSupportLink: React.FC<Props> = React.memo(({ text }) => {
  return (
    <a onClick={show} href="#" style={{ cursor: "pointer" }}>
      {text ?? "support ticket"}
    </a>
  );
});
