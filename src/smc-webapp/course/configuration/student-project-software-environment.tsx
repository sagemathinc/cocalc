/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { React, useState, useTypedRedux } from "../../app-framework";
import { fromJS } from "immutable";
import { Icon, Markdown, A } from "../../r_misc";
import {
  SoftwareEnvironment,
  SoftwareEnvironmentState,
} from "../../custom-software/selector";
import { ConfigurationActions } from "./actions";
import { Button, Card, Alert } from "antd";
import { HelpEmailLink } from "../../customize";
import { SoftwareImageDisplay } from "../../project/settings/project-control";
import {
  compute_image2basename,
  is_custom_image,
} from "../../custom-software/util";
import { ComputeImage, ComputeImages } from "../../custom-software/init";
import {
  COMPUTE_IMAGES as COMPUTE_IMAGES_ORIG,
  DEFAULT_COMPUTE_IMAGE,
} from "smc-util/compute-images";
const COMPUTE_IMAGES = fromJS(COMPUTE_IMAGES_ORIG); // only because that's how all the ui code was written.
import { KUCALC_COCALC_COM } from "smc-util/db-schema/site-defaults";

const CSI_HELP =
  "https://doc.cocalc.com/software.html#custom-software-environment";

interface Props {
  actions: ConfigurationActions;
  software_image?: string;
}

export const StudentProjectSoftwareEnvironment: React.FC<Props> = ({
  actions,
  software_image,
}) => {
  const customize_kucalc = useTypedRedux("customize", "kucalc");

  const [changing, set_changing] = useState(false);
  const [state, set_state] = useState<SoftwareEnvironmentState>({});

  function handleChange(state): void {
    set_state(state);
  }
  const current_environment = <SoftwareImageDisplay image={software_image} />;

  const custom_images: ComputeImages | undefined = useTypedRedux(
    "compute_images",
    "images"
  );

  function render_controls() {
    if (!changing) return;
    const csi_warning = (
      <Alert
        type={"warning"}
        message={
          <>
            <strong>Warning:</strong> Do not change a custom image once there is
            already one setup and deployed!
          </>
        }
        description={
          "The associated user files will not be updated and the software environment changes might break the functionality of existing files."
        }
      />
    );

    return (
      <>
        <Button
          style={{ margin: "0 5px 0 30px" }}
          onClick={() => set_changing(false)}
        >
          Cancel
        </Button>
        <Button
          disabled={
            state.image_type === "custom" && state.image_selected == null
          }
          type="primary"
          onClick={() => {
            set_changing(false);
            actions.set_software_environment(state);
          }}
        >
          Save
        </Button>
        <br />
        <SoftwareEnvironment
          onChange={handleChange}
          default_image={software_image}
        />
        {state.image_type === "custom" && csi_warning}
      </>
    );
  }

  function render_description() {
    const img_id = software_image ?? DEFAULT_COMPUTE_IMAGE;
    let descr: string | undefined;
    if (is_custom_image(img_id)) {
      if (custom_images == null) return;
      const base_id = compute_image2basename(img_id);
      const img: ComputeImage | undefined = custom_images.get(base_id);
      if (img != null) {
        descr = img.get("desc");
      }
    } else {
      const img = COMPUTE_IMAGES.get(img_id);
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
        If you need additional software or a fully{" "}
        <A href={CSI_HELP}>customized software environment</A>, please contact{" "}
        <HelpEmailLink />.
      </p>
    );
  }

  // this selector only make sense for cocalc.com
  if (customize_kucalc !== KUCALC_COCALC_COM) return null;

  return (
    <Card
      title={
        <>
          <Icon name="laptop-code" /> Software environment:{" "}
          {current_environment}
        </>
      }
    >
      <p>
        Student projects will be using the software environment:{" "}
        <em>{current_environment}</em>
      </p>
      {render_description()}
      {render_custom_info()}
      <Button onClick={() => set_changing(true)} disabled={changing}>
        Change...
      </Button>
      {render_controls()}
    </Card>
  );
};
