/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
Create a new project
*/

import { Button, Card, Col, Form, Input, Modal, Row, Space } from "antd";
import { delay } from "awaiting";
import { FormattedMessage, useIntl } from "react-intl";

import { Well } from "@cocalc/frontend/antd-bootstrap";
import {
  CSS,
  redux,
  useEffect,
  useIsMountedRef,
  useMemo,
  useRef,
  useState,
  useTypedRedux,
} from "@cocalc/frontend/app-framework";
import { A, ErrorDisplay, Icon, Paragraph } from "@cocalc/frontend/components";
import {
  derive_project_img_name,
  SoftwareEnvironment,
  SoftwareEnvironmentState,
} from "@cocalc/frontend/custom-software/selector";
import { labels } from "@cocalc/frontend/i18n";
// import { ComputeImageSelector } from "@cocalc/frontend/project/settings/compute-image-selector";
import { SiteLicenseInput } from "@cocalc/frontend/site-licenses/input";
import { BuyLicenseForProject } from "@cocalc/frontend/site-licenses/purchase/buy-license-for-project";
import track from "@cocalc/frontend/user-tracking";
// import { DEFAULT_COMPUTE_IMAGE } from "@cocalc/util/db-schema";
import {
  KUCALC_COCALC_COM,
  KUCALC_ON_PREMISES,
} from "@cocalc/util/db-schema/site-defaults";
import { isValidUUID } from "@cocalc/util/misc";
import { COLORS } from "@cocalc/util/theme";

const TOGGLE_STYLE: CSS = { margin: "10px 0" } as const;
const TOGGLE_BUTTON_STYLE: CSS = { padding: "0" } as const;
const CARD_STYLE: CSS = { margin: "10px 0" } as const;

interface Props {
  noProjects?: boolean;
  default_value?: string;
}

type EditState = "edit" | "view" | "saving";

export function NewProjectCreator({ noProjects, default_value }: Props) {
  const intl = useIntl();
  // view --> edit --> saving --> view
  const [state, set_state] = useState<EditState>(noProjects ? "edit" : "view");
  const [title_text, set_title_text] = useState<string>(default_value ?? "");
  const [error, set_error] = useState<string>("");
  const [title_prefill, set_title_prefill] = useState<boolean>(false);
  const [license_id, set_license_id] = useState<string>("");
  const [custom_software, set_custom_software] =
    useState<SoftwareEnvironmentState>({});
  const new_project_title_ref = useRef(null);
  const is_anonymous = useTypedRedux("account", "is_anonymous");
  const customize_kucalc = useTypedRedux("customize", "kucalc");
  const compute_servers_enabled = useTypedRedux(
    "customize",
    "compute_servers_enabled",
  );
  const isCoCalcCom = useTypedRedux("customize", "is_cocalc_com");
  const hasLegacyUpgrades = redux.getStore("account").hasLegacyUpgrades();
  // only require a license on cocalc.com, if users has no upgrades, and if configured to require a license
  const requireLicense =
    isCoCalcCom &&
    !hasLegacyUpgrades &&
    !!useTypedRedux("customize", "require_license_to_create_project");
  const [show_add_license, set_show_add_license] =
    useState<boolean>(requireLicense);

  // onprem and cocalc.com use licenses to adjust quota configs – but only cocalc.com has custom software images
  const show = useMemo(
    () => [KUCALC_COCALC_COM, KUCALC_ON_PREMISES].includes(customize_kucalc),
    [customize_kucalc],
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

  function render_error(): JSX.Element | undefined {
    if (!error) return;

    return (
      <Row>
        <Col sm={24}>
          <ErrorDisplay error={error} onClose={() => set_error("")} />
        </Col>
      </Row>
    );
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
            disabled={noProjects || state !== "view"}
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
            requireLicense={requireLicense}
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
    const helpTxt = intl.formatMessage({
      id: "projects.create-project.helpTxt",
      defaultMessage: "You can easily change the title later!",
    });

    return (
      <>
        <Row gutter={[30, 15]}>
          <Col sm={12}>
            <Form form={form}>
              <Form.Item
                label={intl.formatMessage({
                  id: "projects.create-project.title",
                  defaultMessage: "Project Title",
                })}
                name="title"
                initialValue={title_text}
                rules={[
                  {
                    required: true,
                    min: 1,
                    message: helpTxt,
                  },
                ]}
                help={helpTxt}
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
            <Paragraph type="secondary">
              <FormattedMessage
                id="projects.create-project.explanation"
                defaultMessage={`A <A1>project</A1> is a private computational workspace,
                  where you can work with collaborators that you explicitly invite.
                  {compute_servers_enabled, select,
                  true {You can attach powerful <A2>GPUs, CPUs</A2> and <A3>storage</A3> to a project.}
                  other {}}`}
                values={{
                  compute_servers_enabled,
                  A1: (c) => (
                    <A href="https://doc.cocalc.com/project.html">{c}</A>
                  ),
                  A2: (c) => (
                    <A href="https://doc.cocalc.com/compute_server.html">{c}</A>
                  ),
                  A3: (c) => (
                    <A href="https://doc.cocalc.com/cloud_file_system.html">
                      {c}
                    </A>
                  ),
                }}
              />
            </Paragraph>
          </Col>
          <SoftwareEnvironment onChange={custom_software_on_change} />
        </Row>
        {render_add_license()}
        {render_license()}
        {noProjects && (
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
                  {renderOKButtonText()}
                </Button>
              </Space>
            </Col>
          </Row>
        )}
        {render_error()}
      </>
    );
  }

  function renderOKButtonText() {
    return intl.formatMessage(
      {
        id: "projects.create-project.create",
        defaultMessage:
          "Create Project {requireLicense, select, true {(select license above)} other {}}",
      },
      {
        requireLicense: requireLicense && !license_id,
      },
    );
  }

  function render_project_creation(): JSX.Element | undefined {
    if (state === "view") return;
    // if user has no projects yet, show the create dialog directly – otherwise its a modal
    if (noProjects) {
      return (
        <Well style={{ backgroundColor: "#FFF" }}>
          {render_input_section()}
        </Well>
      );
    } else {
      return (
        <Modal
          title={intl.formatMessage(labels.create_project)}
          open={state === "edit" || state === "saving"}
          okButtonProps={{ disabled: isDisabled() }}
          okText={renderOKButtonText()}
          cancelText={intl.formatMessage(labels.cancel)}
          onCancel={cancel_editing}
          onOk={create_project}
          confirmLoading={state === "saving"}
          width={{
            xs: "90%",
            sm: "90%",
            md: "80%",
            lg: "75%",
            xl: "70%",
            xxl: "60%",
          }}
        >
          {render_input_section()}
        </Modal>
      );
    }
  }

  return (
    <div>
      {render_new_project_button()}
      {render_project_creation()}
    </div>
  );
}
