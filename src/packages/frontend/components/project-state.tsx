/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { React, useTypedRedux } from "../app-framework";
import { COMPUTE_STATES } from "@cocalc/util/schema";
import { ProjectStatus } from "../todo-types";
import { Space } from "./space";
import { Icon } from "./icon";
import { KUCALC_COCALC_COM } from "@cocalc/util/db-schema/site-defaults";

interface Props {
  state?: ProjectStatus;
  show_desc?: boolean;
}

export const ProjectState: React.FC<Props> = (props: Props) => {
  const { state, show_desc } = props;

  const kucalc = useTypedRedux("customize", "kucalc");
  const showCoCalcCom = kucalc === KUCALC_COCALC_COM;

  function renderSpinner() {
    return (
      <span style={{ marginRight: "15px" }}>
        ... <Icon name="cocalc-ring" spin />
      </span>
    );
  }

  function renderDescription({ desc, desc_cocalccom }) {
    if (!show_desc) {
      return;
    }
    const text =
      showCoCalcCom && desc_cocalccom != null ? desc_cocalccom : desc;
    return (
      <span>
        <span style={{ fontSize: "11pt" }}>{text}</span>
      </span>
    );
  }

  const s = COMPUTE_STATES[state?.get("state") ?? ""];
  if (s == null) {
    return <></>;
  }
  const { display, icon, stable } = s;
  return (
    <span>
      <Icon name={icon} /> {display}
      <Space />
      {!stable && renderSpinner()}
      {renderDescription(s)}
    </span>
  );
};
