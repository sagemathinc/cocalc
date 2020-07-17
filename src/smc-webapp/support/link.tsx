/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { React, redux } from "../app-framework";

interface Props {
  text?: string;
}

function show(evt) {
  evt.preventDefault();
  redux.getActions("support").set_show(true);
}

export const ShowSupportLink: React.FC<Props> = React.memo(({ text }) => {
  return (
    <a onClick={show} href="#" style={{ cursor: "pointer" }}>
      {text ?? "support ticket"}
    </a>
  );
});
