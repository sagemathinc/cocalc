/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import {
  React,
  redux,
  Rendered,
  useState,
  useTypedRedux,
} from "@cocalc/frontend/app-framework";
import { A, Icon, Markdown } from "@cocalc/frontend/components";
import {
  ComputeImage,
  ComputeImages,
} from "@cocalc/frontend/custom-software/init";
import {
  SoftwareEnvironment,
  SoftwareEnvironmentState,
} from "@cocalc/frontend/custom-software/selector";
import {
  compute_image2basename,
  is_custom_image,
} from "@cocalc/frontend/custom-software/util";
import { HelpEmailLink } from "@cocalc/frontend/customize";
import { SoftwareImageDisplay } from "@cocalc/frontend/project/settings/software-image-display";
import {
  COMPUTE_IMAGES as COMPUTE_IMAGES_ORIG,
  DEFAULT_COMPUTE_IMAGE,
} from "@cocalc/util/compute-images";
import { KUCALC_COCALC_COM } from "@cocalc/util/db-schema/site-defaults";
import { Alert, Button, Card, Divider, Radio } from "antd";
import { fromJS } from "immutable";
import { ConfigurationActions } from "./actions";

const COMPUTE_IMAGES = fromJS(COMPUTE_IMAGES_ORIG); // only because that's how all the ui code was written.

const CSI_HELP =
  "https://doc.cocalc.com/software.html#custom-software-environment";

interface Props {
  actions: ConfigurationActions;
  course_project_id: string;
  software_image?: string;
  inherit_compute_image?: boolean;
}

export const StudentProjectSoftwareEnvironment: React.FC<Props> = ({
  actions,
  course_project_id,
  software_image,
  inherit_compute_image,
}) => {
  const customize_kucalc = useTypedRedux("customize", "kucalc");

  // by default, we inherit the software image from the project where this course is run from
  const inherit = inherit_compute_image ?? true;
  const [state, set_state] = useState<SoftwareEnvironmentState>({});
  const [changing, set_changing] = useState(false);

  function handleChange(state): void {
    set_state(state);
  }
  const current_environment = <SoftwareImageDisplay image={software_image} />;

  const custom_images: ComputeImages | undefined = useTypedRedux(
    "compute_images",
    "images"
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

  React.useEffect(() => {
    if (inherit) {
      set_changing(false);
    }
  }, [inherit]);

  function csi_warning(): Rendered {
    return (
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
  }

  function render_controls_body(): Rendered {
    if (!changing) {
      return (
        <Button onClick={() => set_changing(true)} disabled={changing}>
          Change...
        </Button>
      );
    } else {
      return (
        <>
          <Button onClick={() => set_changing(false)}>Cancel</Button>
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
          {state.image_type === "custom" && csi_warning()}
        </>
      );
    }
  }

  function render_controls(): Rendered {
    if (inherit) return;
    return (
      <>
        <Divider orientation="left" plain>
          Configure
        </Divider>
        {render_controls_body()}
      </>
    );
  }

  function render_description(): Rendered {
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

  function render_custom_info(): Rendered {
    if (software_image != null && is_custom_image(software_image)) return;
    return (
      <p>
        If you need additional software or a fully{" "}
        <A href={CSI_HELP}>customized software environment</A>, please contact{" "}
        <HelpEmailLink />.
      </p>
    );
  }

  function render_inherit(): Rendered {
    // We use fontWeight: "normal" below because otherwise the default
    // of bold for the entire label is a bit much for such a large label.
    return (
      <Radio.Group
        onChange={(e) => on_inherit_change(e.target.value)}
        value={inherit}
      >
        <Radio style={{ fontWeight: "normal" }} value={true}>
          <strong>Inherit</strong> student projects software environments from
          this teacher project
        </Radio>
        <Radio style={{ fontWeight: "normal" }} value={false}>
          <strong>Explicitly</strong> specify student project software
          environments
        </Radio>
      </Radio.Group>
    );
  }

  // this selector only make sense for cocalc.com
  if (customize_kucalc !== KUCALC_COCALC_COM) return null;

  return (
    <Card
      title={
        <>
          <Icon name="laptop" /> Software environment: {current_environment}
        </>
      }
    >
      <p>
        Student projects will be using the software environment:{" "}
        <em>{current_environment}</em>
      </p>
      {render_description()}
      {render_custom_info()}
      {render_inherit()}
      {render_controls()}
    </Card>
  );
};
