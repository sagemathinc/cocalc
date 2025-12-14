/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

// cspell:ignore descr

import { Alert, Card, Divider, Radio, Space } from "antd";
import { useState } from "react";
import { FormattedMessage, useIntl } from "react-intl";

import { redux, useTypedRedux } from "@cocalc/frontend/app-framework";
import { A, Icon, Markdown } from "@cocalc/frontend/components";
import {
  ComputeImage,
  ComputeImages,
  ComputeImageTypes,
} from "@cocalc/frontend/custom-software/init";
import { SoftwareEnvironmentState } from "@cocalc/frontend/custom-software/selector";
import {
  compute_image2basename,
  is_custom_image,
} from "@cocalc/frontend/custom-software/util";
import { HelpEmailLink } from "@cocalc/frontend/customize";
import { labels } from "@cocalc/frontend/i18n";
import { useProjectContext } from "@cocalc/frontend/project/context";
import { ComputeImageSelector } from "@cocalc/frontend/project/settings/compute-image-selector";
import { SoftwareImageDisplay } from "@cocalc/frontend/project/settings/software-image-display";
import {
  KUCALC_COCALC_COM,
  KUCALC_ON_PREMISES,
} from "@cocalc/util/db-schema/site-defaults";
import { ConfigurationActions } from "./actions";

const CSI_HELP =
  "https://doc.cocalc.com/software.html#custom-software-environment";

interface Props {
  actions: ConfigurationActions;
  course_project_id: string;
  software_image?: string;
  inherit_compute_image?: boolean;
  close?;
}

export function StudentProjectSoftwareEnvironment({
  actions,
  course_project_id,
  software_image,
  inherit_compute_image,
  close,
}: Props) {
  const intl = useIntl();
  const { onCoCalcCom } = useProjectContext();
  const customize_kucalc = useTypedRedux("customize", "kucalc");
  const customize_software = useTypedRedux("customize", "software");
  const software_envs = customize_software.get("environments");
  const default_compute_img = customize_software.get("default");

  // by default, we inherit the software image from the project where this course is run from
  const inherit = inherit_compute_image ?? true;
  const [state, set_state] = useState<SoftwareEnvironmentState>({});
  const [changing, set_changing] = useState(false);

  async function handleSelect({
    id,
    display,
    type,
  }: {
    id: string;
    display: string;
    type: ComputeImageTypes;
  }) {
    set_changing(true);
    const nextState: SoftwareEnvironmentState = {
      image_selected: id,
      title_text: display,
      image_type: type,
    };
    set_state(nextState);
    await actions.set_software_environment(nextState);
    set_changing(false);
    close?.();
  }
  const current_environment = <SoftwareImageDisplay image={software_image} />;

  const custom_images: ComputeImages | undefined = useTypedRedux(
    "compute_images",
    "images",
  );

  function on_inherit_change(inherit: boolean) {
    if (inherit) {
      // we have to get the compute image name from the course project
      const projects_store = redux.getStore("projects");
      const course_project_compute_image = projects_store.getIn([
        "project_map",
        course_project_id,
        "compute_image",
      ]);
      actions.set_inherit_compute_image(course_project_compute_image);
    } else {
      actions.set_inherit_compute_image();
    }
  }

  function csi_warning() {
    return (
      <Alert
        type={"warning"}
        message={
          <>
            <strong>Warning:</strong> Do not change a specialized software
            environment after it has already been deployed and in use!
          </>
        }
        description={
          "The associated user files will not be updated and the software environment changes likely break the functionality of existing files."
        }
      />
    );
  }

  function render_controls_body() {
    return (
      <Space direction="vertical" style={{ width: "100%" }}>
        <ComputeImageSelector
          current_image={software_image ?? default_compute_img}
          layout={"dialog"}
          onSelect={handleSelect}
          hideCustomImages={!onCoCalcCom}
          label={intl.formatMessage(labels.save)}
          changing={changing}
        />
        {state.image_type === "custom" && csi_warning()}
      </Space>
    );
  }

  function render_controls() {
    if (inherit) return;
    return (
      <>
        <Divider titlePlacement="start">
          {intl.formatMessage(labels.configuration)}
        </Divider>
        {render_controls_body()}
      </>
    );
  }

  function render_description() {
    const img_id = software_image ?? default_compute_img;
    let descr: string | undefined;
    if (is_custom_image(img_id)) {
      if (custom_images == null) return;
      const base_id = compute_image2basename(img_id);
      const img: ComputeImage | undefined = custom_images.get(base_id);
      if (img != null) {
        descr = img.get("desc");
      }
    } else {
      const img = software_envs.get(img_id);
      if (img != null) {
        descr = `<i>(${img.get("descr")})</i>`;
      }
    }
    if (descr) {
      return (
        <Markdown
          style={{
            display: "block",
            maxHeight: "200px",
            overflowY: "auto",
            marginTop: "10px",
            marginBottom: "10px",
          }}
          value={descr}
        />
      );
    }
  }

  function render_custom_info() {
    if (software_image != null && is_custom_image(software_image)) return;
    return (
      <p>
        <FormattedMessage
          id="course.student-project-software-environment.help"
          defaultMessage={`If you need additional software or a fully <A>customized software environment</A>,
  please contact {help}.`}
          values={{
            help: <HelpEmailLink />,
            A: (c) => <A href={CSI_HELP}>{c}</A>,
          }}
        />
      </p>
    );
  }

  function render_inherit() {
    // We use fontWeight: "normal" below because otherwise the default
    // of bold for the entire label is a bit much for such a large label.
    return (
      <Radio.Group
        onChange={(e) => on_inherit_change(e.target.value)}
        value={inherit}
      >
        <Radio style={{ fontWeight: "normal" }} value={true}>
          <FormattedMessage
            id="course.student-project-software-environment.inherit.true"
            defaultMessage={`<strong>Inherit</strong> student projects software environments from this teacher project`}
          />
        </Radio>
        <Radio style={{ fontWeight: "normal" }} value={false}>
          <FormattedMessage
            id="course.student-project-software-environment.inherit.false"
            defaultMessage={`<strong>Explicitly</strong> specify student project software environments`}
          />
        </Radio>
      </Radio.Group>
    );
  }

  // this selector only make sense for cocalc.com and cocalc-onprem
  if (
    customize_kucalc !== KUCALC_COCALC_COM &&
    customize_kucalc !== KUCALC_ON_PREMISES
  )
    return null;

  return (
    <Card
      title={
        <>
          <Icon name="laptop" />{" "}
          {intl.formatMessage(labels.software_environment)}:{" "}
          {current_environment}
        </>
      }
    >
      <p>
        <FormattedMessage
          id="course.student-project-software-environment.status"
          defaultMessage={`Student projects will use the following software environment: <em>{env}</em>`}
          values={{
            em: (c) => <em>{c}</em>,
            env: current_environment,
          }}
        />
      </p>
      {render_description()}
      {render_custom_info()}
      {render_inherit()}
      {render_controls()}
    </Card>
  );
}
