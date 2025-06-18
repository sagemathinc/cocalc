/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

// cSpell:ignore descr disp dflt

import { Col, Form } from "antd";
import { FormattedMessage, useIntl } from "react-intl";

import {
  React,
  redux,
  useMemo,
  useState,
  useTypedRedux,
} from "@cocalc/frontend/app-framework";
import { A, HelpIcon, Icon, Paragraph } from "@cocalc/frontend/components";
import { CompanyName } from "@cocalc/frontend/customize";
import { labels } from "@cocalc/frontend/i18n";
import { ComputeImageSelector } from "@cocalc/frontend/project/settings/compute-image-selector";
import { SOFTWARE_ENVIRONMENT_ICON } from "@cocalc/frontend/project/settings/software-consts";
import { SoftwareEnvironmentInformation } from "@cocalc/frontend/project/settings/software-env-info";
import { SoftwareInfo } from "@cocalc/frontend/project/settings/types";
import { KUCALC_COCALC_COM } from "@cocalc/util/db-schema/site-defaults";
import { unreachable } from "@cocalc/util/misc";
import { ComputeImage, ComputeImageTypes, ComputeImages } from "./init";
import {
  CUSTOM_SOFTWARE_HELP_URL,
  compute_image2basename,
  custom_image_name,
  is_custom_image,
} from "./util";

export interface SoftwareEnvironmentState {
  image_selected?: string;
  title_text?: string;
  image_type?: ComputeImageTypes;
}

// this is used in create-project and course/configuration/actions
// this derives the proper image name from the image type & image selection of SoftwareEnvironmentState
export async function derive_project_img_name(
  custom_software: SoftwareEnvironmentState,
): Promise<string> {
  const { image_type, image_selected } = custom_software;
  const dflt_software_img = await redux
    .getStore("customize")
    .getDefaultComputeImage();
  if (image_selected == null || image_type == null) {
    return dflt_software_img;
  }
  switch (image_type) {
    case "custom":
      return custom_image_name(image_selected);
    case "standard":
      return image_selected;
    default:
      unreachable(image_type);
      return dflt_software_img; // make TS happy
  }
}

interface Props {
  onChange: (obj: SoftwareEnvironmentState) => void;
  default_image?: string; // which one to initialize state to
}

// this is a selector for the software environment of a project
export function SoftwareEnvironment(props: Props) {
  const { onChange, default_image } = props;
  const intl = useIntl();
  const images: ComputeImages | undefined = useTypedRedux(
    "compute_images",
    "images",
  );
  const customize_kucalc = useTypedRedux("customize", "kucalc");
  const onCoCalcCom = customize_kucalc === KUCALC_COCALC_COM;
  const customize_software = useTypedRedux("customize", "software");
  const dflt_software_img = customize_software.get("default");
  const software_images = customize_software.get("environments");

  const haveSoftwareImages: boolean = useMemo(
    () => (customize_software.get("environments")?.size ?? 0) > 0,
    [customize_software],
  );

  // ID of the image, custom images without "CUSTOM_PREFIX/" – that info is in the image_type variable.
  const [image_selected, set_image_selected] = useState<string | undefined>(
    undefined,
  );
  const [image_type, set_image_type] = useState<ComputeImageTypes>("standard");

  const [softwareInfo, setSoftwareInfo] = useState<SoftwareInfo | null>(null);

  function setState(
    image_selected: string,
    title_text: string,
    image_type: ComputeImageTypes,
  ): void {
    const id =
      image_type === "custom"
        ? custom_image_name(image_selected)
        : image_selected;
    set_image_selected(id);
    set_image_type(image_type);
    onChange({ image_selected, title_text, image_type });
  }

  // initialize selection, if there is a default image set
  React.useEffect(() => {
    if (default_image == null || default_image === dflt_software_img) {
      // do nothing, that's the initial state already!
    } else if (is_custom_image(default_image)) {
      if (images == null) return;
      const id = compute_image2basename(default_image);
      const img: ComputeImage | undefined = images.get(id);
      if (img == null) {
        // ignore, user has to select from scratch
      } else {
        setState(id, img.get("display", ""), "custom");
      }
    } else {
      // must be standard image
      const img = software_images.get(default_image);
      const display = img != null ? img.get("title") ?? "" : "";
      setState(default_image, display, "standard");
    }
  }, []);

  function render_custom_images_config() {
    if (image_type !== "custom") return;

    return (
      <>
        <Col sm={12}>
          <FormattedMessage
            id="custom-software.selector.select-custom-image"
            defaultMessage={`<p>Specialized software environment are provided by 3rd parties and usually contain accompanying files to work with.</p>

            <p>Note: A <em>specialized</em> software environment is tied to the project.
            In order to work in a different environment, create another project.
            You can always <A>copy files between projects</A> as well.</p>`}
            values={{
              em: (c) => <em>{c}</em>,
              p: (c) => <Paragraph type="secondary">{c}</Paragraph>,
              A: (c) => (
                <A
                  href={
                    "https://doc.cocalc.com/project-files.html#file-actions-on-one-file"
                  }
                >
                  {c}
                </A>
              ),
            }}
          />
        </Col>
      </>
    );
  }

  function render_software_form_label() {
    return (
      <span>
        <Icon name={SOFTWARE_ENVIRONMENT_ICON} />{" "}
        {intl.formatMessage(labels.software)}
      </span>
    );
  }

  function render_onprem() {
    const selected = image_selected ?? dflt_software_img;
    return (
      <>
        <Col sm={24}>
          <Form>
            <Form.Item
              label={render_software_form_label()}
              style={{ marginBottom: "0px" }}
            >
              <ComputeImageSelector
                size={"middle"}
                current_image={selected}
                layout={"horizontal"}
                onSelect={({ id }) => {
                  const display = software_images.get(id)?.get("title") ?? id;
                  setState(id, display, "standard");
                }}
              />
            </Form.Item>
          </Form>
        </Col>
      </>
    );
  }

  function render_software_env_help() {
    return (
      <HelpIcon title={intl.formatMessage(labels.software_environment)}>
        <Paragraph>
          <FormattedMessage
            id="custom-software.selector.explanation.cocalc_com"
            defaultMessage={`<em>Standard</em> software environments are well tested and
            maintained by <CompanyName />, while <em>specialized</em> software environments are provided by 3rd parties
            and tied to a given project – <A2>more info...</A2>.
            `}
            values={{
              em: (c) => <em>{c}</em>,
              CompanyName: () => <CompanyName />,
              A2: (c) => <A href={CUSTOM_SOFTWARE_HELP_URL}>{c}</A>,
            }}
          />
          <SoftwareEnvironmentInformation />
        </Paragraph>
      </HelpIcon>
    );
  }

  function render_standard_image_selector() {
    const isCustom = is_custom_image(image_selected ?? dflt_software_img);
    return (
      <>
        <Col sm={12}>
          <Form>
            <Form.Item
              label={render_software_form_label()}
              style={{ marginBottom: "0px" }}
            >
              <ComputeImageSelector
                size="middle"
                current_image={image_selected ?? dflt_software_img}
                layout={"dropdown"}
                setSoftwareInfo={setSoftwareInfo}
                onSelect={({ id, display, type }) => {
                  setState(id, display, type);
                }}
              />
            </Form.Item>
          </Form>
        </Col>
        <Col sm={12}>
          <Paragraph type="secondary">
            <FormattedMessage
              id="custom-software.selector.explanation.onprem"
              defaultMessage={`The software environment provides programming languages, tools and libraries for the project.`}
            />{" "}
            {render_software_env_help()}
          </Paragraph>
        </Col>
        {softwareInfo?.extra != null && (
          <>
            <Col
              sm={isCustom ? 12 : 24}
              style={{
                paddingBottom: "30px",
              }}
            >
              {softwareInfo.extra}
            </Col>
            {isCustom && render_custom_images_config()}
          </>
        )}
      </>
    );
  }

  if (!haveSoftwareImages) {
    return;
  }

  if (onCoCalcCom) {
    return render_standard_image_selector();
  } else {
    return render_onprem();
  }
}
