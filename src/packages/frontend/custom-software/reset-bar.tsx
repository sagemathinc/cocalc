/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Button as AntdButton, Card } from "antd";
import React from "react";
import { FormattedMessage, useIntl } from "react-intl";
import { A, Icon } from "@cocalc/frontend/components";
import { labels } from "@cocalc/frontend/i18n";
import { ProjectMap } from "@cocalc/frontend/todo-types";
import { COLORS, SITE_NAME } from "@cocalc/util/theme";
import { Available as AvailableFeatures } from "../project_configuration";
import { ComputeImages } from "./init";
import { props2img, RESET_ICON } from "./util";
import { useTypedRedux } from "@cocalc/frontend/app-framework";
import { type ProjectActions } from "@cocalc/frontend/project_store";

const doc_snap = "https://doc.cocalc.com/project-files.html#snapshots";
const doc_tt = "https://doc.cocalc.com/time-travel.html";

const title_style: React.CSSProperties = {
  fontWeight: "bold" as "bold",
  fontSize: "15pt",
} as const;

const button_bar_style: React.CSSProperties = {
  whiteSpace: "nowrap" as "nowrap",
} as const;

const info_style: React.CSSProperties = {
  paddingBottom: "20px",
} as const;

interface Props {
  project_id: string;
  images: ComputeImages;
  project_map?: ProjectMap;
  actions: ProjectActions;
  available_features?: AvailableFeatures;
}

export const CustomSoftwareReset: React.FC<Props> = (props: Props) => {
  const { actions } = props;
  const site_name = useTypedRedux("customize", "site_name");

  const intl = useIntl();

  function reset() {
    actions.custom_software_reset();
  }

  function cancel() {
    actions.toggle_custom_software_reset(false);
  }

  function title() {
    return (
      <div style={title_style}>
        <Icon name={RESET_ICON} /> Reset {img.get("display", "")}
      </div>
    );
  }

  const img = props2img(props);
  if (img == null) return null;
  const NAME = site_name || SITE_NAME;

  return (
    <Card style={{ background: COLORS.GRAY_LLL }} title={title()}>
      <div style={info_style}>
        <FormattedMessage
          id="custom-software.reset-bar.info"
          defaultMessage={`
            <p>
              Clicking on "Reset" copies all accompanying files of this custom
              software environment into your home directory. This was done once when
              this project was created and you can repeat this action right now. If
              these accompanying files hosted on {NAME} did update in the meantime,
              you'll recieve the newer versions.
            </p>
            <p>
              Note, that this will overwrite any changes you did to these
              accompanying files, but does not modify or delete any other files.
              However, nothing is lost: you can still access the previous version
              via <A1>Snapshots</A1> or <A2>TimeTravel</A2>.
            </p>
            <p>This action will also restart your project!</p>`}
          values={{
            NAME,
            A1: (c) => <A href={doc_snap}>{c}</A>,
            A2: (c) => <A href={doc_tt}>{c}</A>,
          }}
        />
      </div>
      <div style={button_bar_style}>
        <AntdButton onClick={reset} danger type="primary">
          <Icon name={RESET_ICON} />{" "}
          {intl.formatMessage({
            id: "custom-software.reset-bar.reset-and-restart",
            defaultMessage: "Reset and Restart",
          })}
        </AntdButton>{" "}
        <AntdButton onClick={cancel}>
          <Icon name={"times-circle"} /> {intl.formatMessage(labels.cancel)}
        </AntdButton>
      </div>
    </Card>
  );
};
