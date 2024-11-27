/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { useIntl } from "react-intl";

import { React, useTypedRedux } from "@cocalc/frontend/app-framework";
import { IntlMessage, isIntlMessage } from "@cocalc/frontend/i18n";
import { ProjectStatus } from "@cocalc/frontend/todo-types";
import { ComputeState } from "@cocalc/util/compute-states";
import { KUCALC_COCALC_COM } from "@cocalc/util/db-schema/site-defaults";
import { COMPUTE_STATES } from "@cocalc/util/schema";
import { Gap } from "./gap";
import { Icon, isIconName } from "./icon";

interface Props {
  state?: ProjectStatus;
  show_desc?: boolean;
}

export const ProjectState: React.FC<Props> = (props: Props) => {
  const { state, show_desc } = props;

  const intl = useIntl();
  const kucalc = useTypedRedux("customize", "kucalc");
  const showCoCalcCom = kucalc === KUCALC_COCALC_COM;

  function renderSpinner() {
    return (
      <span style={{ marginRight: "15px" }}>
        ... <Icon name="cocalc-ring" spin />
      </span>
    );
  }

  function renderI18N(msg: string | IntlMessage): string {
    if (isIntlMessage(msg)) {
      return intl.formatMessage(msg);
    } else {
      return msg;
    }
  }

  function renderDescription({ desc_cocalccom, desc }: ComputeState) {
    if (!show_desc) {
      return;
    }
    const text =
      showCoCalcCom && desc_cocalccom != null ? desc_cocalccom : desc;

    return (
      <span>
        <span style={{ fontSize: "11pt" }}>{renderI18N(text)}</span>
      </span>
    );
  }

  const current_state = state?.get("state") ?? "";
  const s: ComputeState = COMPUTE_STATES[current_state];
  if (s == null) {
    return <></>;
  }
  const { display, icon, stable } = s;
  return (
    <span>
      {isIconName(icon) ? <Icon name={icon} /> : undefined}{" "}
      {renderI18N(display)}
      <Gap />
      {!stable && renderSpinner()}
      {renderDescription(s)}
    </span>
  );
};
