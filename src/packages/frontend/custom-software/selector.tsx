/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

// cSpell:ignore descr disp dflt

import { Col, Form, List } from "antd";
import { ReactNode } from "react";
import { FormattedMessage, useIntl } from "react-intl";

import {
  CSS,
  React,
  redux,
  useMemo,
  useState,
  useTypedRedux,
} from "@cocalc/frontend/app-framework";
import {
  A,
  HelpIcon,
  Icon,
  Markdown,
  Paragraph,
  SearchInput,
} from "@cocalc/frontend/components";
import { CompanyName, HelpEmailLink } from "@cocalc/frontend/customize";
import { labels } from "@cocalc/frontend/i18n";
import { ComputeImageSelector } from "@cocalc/frontend/project/settings/compute-image-selector";
import { SoftwareEnvironmentInformation } from "@cocalc/frontend/project/settings/software-env-info";
import { KUCALC_COCALC_COM } from "@cocalc/util/db-schema/site-defaults";
import { unreachable } from "@cocalc/util/misc";
import { COLORS } from "@cocalc/util/theme";
import { SOFTWARE_ENVIRONMENT_ICON } from "../project/settings/software-consts";
import { ComputeImage, ComputeImageTypes, ComputeImages } from "./init";
import {
  CUSTOM_SOFTWARE_HELP_URL,
  compute_image2basename,
  custom_image_name,
  is_custom_image,
} from "./util";
import { SoftwareInfo } from "../project/settings/types";

const CS_LIST_STYLE: CSS = {
  height: "250px",
  overflowX: "hidden" as "hidden",
  overflowY: "scroll" as "scroll",
  border: `1px solid ${COLORS.GRAY_LL}`,
  borderRadius: "5px",
  marginBottom: "0px",
} as const;

const ENTRIES_ITEM_STYLE: CSS = {
  width: "100%",
  margin: "2px 0px",
  padding: "5px",
  border: "none",
  textAlign: "left" as "left",
  cursor: "pointer",
} as const;

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
  const [dflt_software_img, software_images] = useMemo(
    () => [
      customize_software.get("default"),
      customize_software.get("environments"),
    ],
    [customize_software],
  );

  const haveSoftwareImages: boolean = useMemo(
    () => (customize_software.get("environments")?.size ?? 0) > 0,
    [customize_software],
  );

  const [search_img, set_search_img] = useState<string>("");
  const [image_selected, set_image_selected] = useState<string | undefined>(
    undefined,
  );
  const set_title_text = useState<string | undefined>(undefined)[1];
  const [image_type, set_image_type] = useState<ComputeImageTypes>("standard");

  const [softwareInfo, setSoftwareInfo] = useState<SoftwareInfo | null>(null);

  function set_state(
    image_selected: string | undefined,
    title_text: string | undefined,
    image_type: ComputeImageTypes,
  ): void {
    set_image_selected(image_selected);
    set_title_text(title_text);
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
        set_state(id, img.get("display", ""), "custom");
      }
    } else {
      // must be standard image
      const img = software_images.get(default_image);
      const display = img != null ? img.get("title") ?? "" : "";
      set_state(default_image, display, "standard");
    }
  }, []);

  function render_custom_image_entries() {
    if (images == null) return;

    const search_hit = (() => {
      if (search_img.length > 0) {
        return (img: ComputeImage) =>
          img.get("search_str", "").indexOf(search_img.toLowerCase()) >= 0;
      } else {
        return (_img: ComputeImage) => true;
      }
    })();

    const entries: JSX.Element[] = images
      .filter((img) => img.get("type", "") === "custom")
      .filter(search_hit)
      .sortBy((img) => img.get("display", "").toLowerCase())
      .entrySeq()
      .map((e) => {
        const [id, img] = e;
        const display = img.get("display", "");
        return (
          <List.Item
            key={id}
            onClick={() => set_state(id, display, "custom")}
            style={{
              ...ENTRIES_ITEM_STYLE,
              ...(image_selected === id
                ? { background: "#337ab7", color: "white" }
                : undefined),
            }}
          >
            {display}
          </List.Item>
        );
      })
      .toArray();

    if (entries.length > 0) {
      return <List style={CS_LIST_STYLE}>{entries}</List>;
    } else {
      if (search_img.length > 0) {
        return <div>No search hits.</div>;
      } else {
        return <div>No custom software available.</div>;
      }
    }
  }

  function search(val: string): void {
    set_search_img(val);
    set_state(undefined, undefined, image_type);
  }

  function render_custom_images() {
    if (image_type !== "custom") return;

    return (
      <>
        <div style={{ display: "flex" }}>
          <SearchInput
            placeholder={`${intl.formatMessage(labels.search)}…`}
            autoFocus={false}
            value={search_img}
            on_escape={() => search("")}
            on_change={search}
            style={{ flex: "1" }}
          />
        </div>
        {render_custom_image_entries()}
      </>
    );
  }

  function render_custom_images_config() {
    if (image_type !== "custom") return;

    return (
      <>
        <Col sm={12}>{render_custom_images()}</Col>
        <Col sm={12}>{render_selected_custom_image_info()}</Col>
        {render_custom_images_info()}
      </>
    );
  }

  function render_custom_images_info() {
    if (image_type !== "custom") return;

    return (
      <Col sm={24}>
        <Paragraph type="secondary">
          Contact us to add more or give feedback:{" "}
          <HelpEmailLink color={COLORS.GRAY} />.
        </Paragraph>
      </Col>
    );
  }

  function render_selected_custom_image_info() {
    if (image_type !== "custom" || images == null) {
      return;
    }

    // no image selected, so nothing to render
    if (image_selected == null) {
      return (
        <FormattedMessage
          id="custom-software.selector.no-custom-image-selected"
          defaultMessage={`<p>Select a custom software environment to see details.
            They are provided by 3rd parties and usually contain accompanying files to work with.</p>

            <p>Note: A <em>custom</em> software environment is tied to the project.
            Create a new project to work in a different software environment.
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
      );
    }

    const id: string = image_selected;
    const data = images.get(id);
    if (data == null) {
      // we have a serious problem
      console.warn(`compute_image data missing for '${id}'`);
      return;
    }
    // some fields are derived in the "Table" when the data comes in
    const img: ComputeImage = data;
    const disp = img.get("display");
    const desc = img.get("desc", "");
    const url = img.get("url");
    const src = img.get("src");
    const disp_tag = img.get("display_tag");

    const render_source = () => {
      if (src == null || src.length == 0) return;
      return (
        <div style={{ marginTop: "5px" }}>
          Source: <code>{src}</code>
        </div>
      );
    };

    const render_url = () => {
      if (url == null || url.length == 0) return;
      return (
        <div style={{ marginTop: "5px" }}>
          <a href={url} target={"_blank"} rel={"noopener"}>
            <Icon name="external-link" /> Website
          </a>
        </div>
      );
    };

    return (
      <>
        <h3 style={{ marginTop: "5px" }}>{disp}</h3>
        <div style={{ marginTop: "5px" }}>
          Image ID: <code>{disp_tag}</code>
        </div>
        <div
          style={{ marginTop: "10px", overflowY: "auto", maxHeight: "200px" }}
        >
          <Markdown value={desc} className={"cc-custom-image-desc"} />
        </div>
        {render_source()}
        {render_url()}
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
                onSelect={(img) => {
                  const display = software_images.get(img)?.get("title");
                  set_state(img, display, "standard");
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
            maintained by {CompanyName}, while <em>custom</em> software environments are provided by 3rd parties
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
                onSelect={(img) => {
                  const display = software_images.get(img)?.get("title");
                  set_state(img, display, "standard");
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
        {softwareInfo && <Col sm={24}>{softwareInfo}</Col>}
      </>
    );
  }

  if (!haveSoftwareImages) {
    return;
  }

  if (onCoCalcCom) {
    return (
      <>
        {render_standard_image_selector()}
        {render_custom_images_config()}
      </>
    );
  } else {
    return render_onprem();
  }
}
