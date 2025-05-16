/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
Create a new project
*/

import { Button, Card, Col, Form, Input, Row, Space } from "antd";
import { delay } from "awaiting";
import { useIntl } from "react-intl";

import { Alert, Well } from "@cocalc/frontend/antd-bootstrap";
import {
  CSS,
  React,
  redux,
  useEffect,
  useIsMountedRef,
  useMemo,
  useRef,
  useState,
  useTypedRedux,
} from "@cocalc/frontend/app-framework";
import { A, ErrorDisplay, Gap, Icon } from "@cocalc/frontend/components";
import {
  derive_project_img_name,
  SoftwareEnvironment,
  SoftwareEnvironmentState,
} from "@cocalc/frontend/custom-software/selector";
import { labels } from "@cocalc/frontend/i18n";
import { ComputeImageSelector } from "@cocalc/frontend/project/settings/compute-image-selector";
import { SOFTWARE_ENVIRONMENT_ICON } from "@cocalc/frontend/project/settings/software-consts";
import { SiteLicenseInput } from "@cocalc/frontend/site-licenses/input";
import { BuyLicenseForProject } from "@cocalc/frontend/site-licenses/purchase/buy-license-for-project";
import track from "@cocalc/frontend/user-tracking";
import {
  KUCALC_COCALC_COM,
  KUCALC_ON_PREMISES,
} from "@cocalc/util/db-schema/site-defaults";
import { isValidUUID } from "@cocalc/util/misc";
import { COLORS } from "@cocalc/util/theme";
import { DEFAULT_COMPUTE_IMAGE } from "@cocalc/util/db-schema";

const TOGGLE_STYLE: CSS = { margin: "10px 0" } as const;
const TOGGLE_BUTTON_STYLE: CSS = { padding: "0" } as const;
const CARD_STYLE: CSS = { margin: "10px 0" } as const;

interface Props {
  start_in_edit_mode?: boolean;
  default_value?: string;
}

type EditState = "edit" | "view" | "saving";

export const NewProjectCreator: React.FC<Props> = ({
  start_in_edit_mode,
  default_value,
}: Props) => {
  const intl = useIntl();
  // view --> edit --> saving --> view
  const [state, set_state] = useState<EditState>(
    start_in_edit_mode ? "edit" : "view",
  );
  const [title_text, set_title_text] = useState<string>(default_value ?? "");
  const [error, set_error] = useState<string>("");
  const [title_prefill, set_title_prefill] = useState<boolean>(false);
  const [license_id, set_license_id] = useState<string>("");
  const [custom_software, set_custom_software] =
    useState<SoftwareEnvironmentState>({});
  const new_project_title_ref = useRef(null);
  const is_anonymous = useTypedRedux("account", "is_anonymous");
  const customize_kucalc = useTypedRedux("customize", "kucalc");
  const hasLegacyUpgrades = redux.getStore("account").hasLegacyUpgrades();
  const requireLicense =
    !hasLegacyUpgrades &&
    !!useTypedRedux("customize", "require_license_to_create_project");
  const [show_add_license, set_show_add_license] =
    useState<boolean>(requireLicense);

  // onprem and cocalc.com use licenses to adjust quota configs – but only cocalc.com has custom software images
  const show = useMemo(
    () => [KUCALC_COCALC_COM, KUCALC_ON_PREMISES].includes(customize_kucalc),
    [customize_kucalc],
  );

  const customize_software = useTypedRedux("customize", "software");
  const [dflt_software_img, software_images] = useMemo(
    () => [
      customize_software.get("default"),
      customize_software.get("environments"),
    ],
    [customize_software],
  );

  const [form] = Form.useForm();

  useEffect(() => {
    select_text();
  }, []);

  useEffect(() => {
    form.setFieldsValue({ title: title_text });
  }, [title_text]);

  const is_mounted_ref = useIsMountedRef();

  async function select_text(): Promise<void> {
    // wait for next render loop so the title actually is in the DOM...
    await delay(1);
    (new_project_title_ref.current as any)?.input?.select();
  }

  function start_editing(): void {
    set_state("edit");
    set_title_text(default_value ?? "");
    select_text();
  }

  function cancel_editing(): void {
    if (!is_mounted_ref.current) return;
    set_state("view");
    set_title_text(default_value ?? "");
    set_error("");
    set_custom_software({});
    set_show_add_license(requireLicense);
    set_title_prefill(true);
    set_license_id("");
  }

  function toggle_editing(): void {
    if (state === "view") {
      start_editing();
    } else {
      cancel_editing();
    }
  }

  async function create_project(): Promise<void> {
    set_state("saving");
    const actions = redux.getActions("projects");
    let project_id: string;
    const opts = {
      title: title_text,
      image: await derive_project_img_name(custom_software),
      start: true, // used to not start, due to apply_default_upgrades, but upgrades are  deprecated
      license: license_id,
    };
    try {
      project_id = await actions.create_project(opts);
    } catch (err) {
      if (!is_mounted_ref.current) return;
      set_state("edit");
      set_error(`Error creating project -- ${err}`);
      return;
    }
    track("create-project", {
      how: "projects-page",
      project_id,
      license_id,
      ...opts,
    });
    // We also update the customer billing information so apply_default_upgrades works.
    const billing_actions = redux.getActions("billing");
    if (billing_actions != null) {
      try {
        await billing_actions.update_customer();
        await actions.apply_default_upgrades({ project_id }); // see issue #4192
      } catch (err) {
        // Ignore error coming from this -- it's merely a convenience to
        // upgrade the project on creation; user could always do it manually,
        // and nothing in the UI guarantees it will happen.
      }
    }
    // switch_to=true is perhaps suggested by #4088
    actions.open_project({ project_id, switch_to: true });
    cancel_editing();
  }

  function render_info_alert(): JSX.Element | undefined {
    if (state === "saving") {
      return (
        <div style={{ marginTop: "30px" }}>
          <Alert bsStyle="info">
            <Icon name="cocalc-ring" spin />
            <Gap /> Creating project...
          </Alert>
        </div>
      );
    }
  }

  function render_error(): JSX.Element | undefined {
    if (error) {
      return (
        <div style={{ marginTop: "30px" }}>
          <ErrorDisplay error={error} onClose={() => set_error("")} />
        </div>
      );
    }
  }

  function show_account_tab() {
    redux.getActions("page").set_active_tab("account");
  }

  function render_new_project_button(): JSX.Element | undefined {
    if (is_anonymous) {
      // anonymous users can't create projects...
      return (
        <Button
          type="primary"
          size="large"
          onClick={show_account_tab}
          style={{ width: "100%", margin: "30px 0" }}
        >
          Sign up now so you can create more projects and not lose your work!
        </Button>
      );
    }
    return (
      <Row>
        <Col xs={24}>
          <Button
            cocalc-test={"create-project"}
            size="large"
            disabled={state !== "view"}
            onClick={toggle_editing}
            style={{ width: "100%" }}
          >
            <Icon name="plus-circle" />{" "}
            {intl.formatMessage(labels.create_project)}
          </Button>
        </Col>
      </Row>
    );
  }

  function isDisabled() {
    if (requireLicense && !license_id) {
      return true;
    }
    return (
      // no name of new project
      !title_text?.trim() ||
      // currently saving (?)
      state === "saving" ||
      // user wants a non-default image, but hasn't selected one yet
      ((custom_software.image_type === "custom" ||
        custom_software.image_type === "standard") &&
        custom_software.image_selected == null)
    );
  }

  function set_title(text: string): void {
    set_title_text(text);
    set_title_prefill(false);
  }

  function input_on_change(): void {
    const text = (new_project_title_ref.current as any)?.input?.value;
    set_title(text);
  }

  function handle_keypress(e): void {
    if (e.keyCode === 27) {
      cancel_editing();
    } else if (e.keyCode === 13 && title_text !== "") {
      create_project();
    }
  }

  function custom_software_on_change(obj: SoftwareEnvironmentState): void {
    if (obj.title_text != null && (!title_prefill || !title_text)) {
      set_title(obj.title_text);
    }
    set_custom_software(obj);
  }

  function render_customize_software_env() {
    return (
      <>
        <Form.Item label="Software environment">
          <ComputeImageSelector
            current_image={DEFAULT_COMPUTE_IMAGE}
            layout={"dropdown"}
            onSelect={(img) => {
              const display = software_images.get(img)?.get("title");
              custom_software_on_change({
                image_selected: img,
                title_text: display,
                image_type: "standard",
              });
            }}
            changing={false}
            label={"set"}
          />
        </Form.Item>

        <Card size="small" title="Software environment" style={CARD_STYLE}>
          <SoftwareEnvironment
            onChange={custom_software_on_change}
            showTitle={false}
          />
        </Card>
      </>
    );
  }

  function addSiteLicense(lic: string): void {
    set_license_id(lic);
  }

  function render_add_license() {
    if (!show) return;
    if (!show_add_license) {
      return (
        <div style={TOGGLE_STYLE}>
          <Button
            disabled={requireLicense}
            onClick={() => set_show_add_license(true)}
            type="link"
            style={TOGGLE_BUTTON_STYLE}
          >
            <Icon name="plus" /> Add a license key...
          </Button>
        </div>
      );
    } else {
      return (
        <Card
          size="small"
          title={
            <h4>
              <div style={{ float: "right" }}>
                <BuyLicenseForProject />
              </div>
              <Icon name="key" /> Select License
            </h4>
          }
          style={CARD_STYLE}
        >
          <SiteLicenseInput
            requireValid
            confirmLabel={"Add this license"}
            onChange={addSiteLicense}
            requireLicense
            requireMessage={`A license is required to create additional projects.`}
          />
        </Card>
      );
    }
  }

  function render_license() {
    if (isValidUUID(license_id)) {
      return (
        <div style={{ color: COLORS.GRAY }}>
          This project will have the license <code>{license_id}</code> applied
          to. You can{" "}
          <A
            href={
              "https://doc.cocalc.com/project-settings.html#project-add-license"
            }
          >
            add/remove licenses
          </A>{" "}
          in project settings later.
        </div>
      );
    }
  }

  function render_input_section(): JSX.Element | undefined {
    const helpTxt =
      "The title of your new project.  You can easily change this later!";
    return (
      <Well style={{ backgroundColor: "#FFF" }}>
        <Row>
          <Col sm={12}>
            <Form form={form}>
              <Form.Item
                label="Project Title"
                name="title"
                initialValue={title_text}
                rules={[
                  {
                    required: true,
                    min: 1,
                    message: helpTxt,
                  },
                ]}
                help={"You can change the title at any time."}
              >
                <Input
                  ref={new_project_title_ref}
                  placeholder={"Name your new project..."}
                  disabled={state === "saving"}
                  onChange={input_on_change}
                  onKeyDown={handle_keypress}
                  autoFocus
                />
              </Form.Item>
            </Form>
          </Col>
          <Col sm={12}>
            <div style={{ color: COLORS.GRAY, marginLeft: "30px" }}>
              A <A href="https://doc.cocalc.com/project.html">project</A> is a
              private computational workspace that you can use with
              collaborators that you explicitly invite. You can attach powerful{" "}
              <A href="https://doc.cocalc.com/compute_server.html">
                GPUs, CPUs
              </A>{" "}
              and{" "}
              <A href="https://doc.cocalc.com/cloud_file_system.html">
                storage
              </A>{" "}
              to a project.
            </div>
          </Col>
        </Row>
        {render_customize_software_env()}
        {render_add_license()}
        {render_license()}
        <Row>
          <Col sm={24} style={{ marginTop: "10px" }}>
            <Space>
              <Button disabled={state === "saving"} onClick={cancel_editing}>
                {intl.formatMessage(labels.cancel)}
              </Button>
              <Button
                disabled={isDisabled()}
                onClick={() => create_project()}
                type="primary"
              >
                Create Project
                {requireLicense && !license_id && <> (select license above)</>}
              </Button>
            </Space>
          </Col>
        </Row>
        <Row>
          <Col sm={24}>
            {render_error()}
            {render_info_alert()}
          </Col>
        </Row>
      </Well>
    );
  }

  function render_project_creation(): JSX.Element | undefined {
    if (state == "view") return;
    return (
      <Row style={{ width: "100%", paddingBottom: "20px" }}>
        <Col sm={24}>
          <Gap />
          {render_input_section()}
        </Col>
      </Row>
    );
  }

  return (
    <div>
      {render_new_project_button()}
      {render_project_creation()}
    </div>
  );
};
