/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
Create a new project
*/

import { Button, Card, Col, Form, Input, Modal, Row } from "antd";
import { delay } from "awaiting";
import { FormattedMessage, useIntl } from "react-intl";

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
import type { Host } from "@cocalc/conat/hub/api/hosts";
import { SelectNewHost } from "@cocalc/frontend/hosts/select-new-host";

const TOGGLE_STYLE: CSS = { margin: "10px 0" } as const;
const TOGGLE_BUTTON_STYLE: CSS = { padding: "0" } as const;
const CARD_STYLE: CSS = { margin: "10px 0" } as const;

interface Props {
  noProjects: boolean;
  default_value: string;
  /** Increment this value to trigger the modal to open */
  open_trigger?: number;
}

type EditState = "edit" | "view" | "saving";

export function NewProjectCreator({
  noProjects,
  default_value,
  open_trigger,
}: Props) {
  const intl = useIntl();
  // view --> edit --> saving --> view
  const [state, set_state] = useState<EditState>(noProjects ? "edit" : "view");
  const [title_text, set_title_text] = useState<string>(
    default_value ?? getDefaultTitle(),
  );
  const [error, set_error] = useState<string>("");
  const [title_manually, set_title_manually] = useState<boolean>(
    default_value.length > 0,
  );
  const [license_id, set_license_id] = useState<string>("");
  const [selected, setSelected] = useState<SoftwareEnvironmentState>({});
  const new_project_title_ref = useRef<any>(null);
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
  const [selectedHost, setSelectedHost] = useState<Host | undefined>();

  // onprem and cocalc.com use licenses to adjust quota configs – but only cocalc.com has custom software images
  const show = useMemo(
    () => [KUCALC_COCALC_COM, KUCALC_ON_PREMISES].includes(customize_kucalc),
    [customize_kucalc],
  );

  const [form] = Form.useForm();

  useEffect(() => {
    form.setFieldsValue({ title: title_text });
  }, [title_text]);

  useEffect(() => {
    set_title_manually(default_value.length > 0);
  }, [default_value.length > 0]);

  // Open modal when open_trigger changes
  useEffect(() => {
    if (open_trigger != null && open_trigger > 0) {
      start_editing();
    }
  }, [open_trigger]);

  const is_mounted_ref = useIsMountedRef();

  async function select_text(): Promise<void> {
    // wait for next render loop so the title actually is in the DOM...
    await delay(1);
    (new_project_title_ref.current as any)?.input?.select();
  }

  function getDefaultTitle(): string {
    const ts = new Date().toISOString().split("T")[0];
    return `Untitled ${ts}`;
  }

  function start_editing(): void {
    set_state("edit");
    set_title_text(default_value || getDefaultTitle());
    select_text();
  }

  function cancel_editing(): void {
    if (!is_mounted_ref.current) return;
    set_state("view");
    set_title_text(default_value || getDefaultTitle());
    set_error("");
    setSelected({});
    set_show_add_license(requireLicense);
    set_title_manually(false);
    set_license_id("");
    setSelectedHost(undefined);
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
      image: await derive_project_img_name(selected),
      start: true, // used to not start, due to apply_default_upgrades, but upgrades are  deprecated
      license: license_id,
      host_id: selectedHost?.id,
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

  function render_error(): React.JSX.Element | undefined {
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

  function render_new_project_button(): React.JSX.Element | undefined {
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
      ((selected.image_type === "custom" ||
        selected.image_type === "standard") &&
        selected.image_selected == null)
    );
  }

  function input_on_change(): void {
    const text = (new_project_title_ref.current as any)?.input?.value;
    set_title_text(text);
    set_title_manually(true);
  }

  function handle_keypress(e): void {
    if (e.keyCode === 27) {
      cancel_editing();
    } else if (e.keyCode === 13 && title_text !== "") {
      create_project();
    }
  }

  function onChangeHandler(obj: SoftwareEnvironmentState): void {
    // only change the project title, if the user has not manually set it or it is empty – or if it is a custom image
    // by default, this contains a generic date-based title.
    if (obj.title_text != null) {
      if (!title_text) {
        set_title_text(obj.title_text);
      } else if (!title_manually && obj.image_type === "custom") {
        set_title_text(obj.title_text);
      }
    }
    setSelected(obj);
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
            requireMessage={intl.formatMessage({
              id: "projects.create-project.requireLicense",
              defaultMessage:
                "A license is required to create additional projects.",
            })}
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

  function render_input_section(): React.JSX.Element | undefined {
    const helpTxt = intl.formatMessage({
      id: "projects.create-project.helpTxt",
      defaultMessage: "Pick a title. You can easily change it later!",
    });

    return (
      <>
        <Row gutter={[30, 10]}>
          <Col sm={12}>
            <Form form={form}>
              <Form.Item
                label={intl.formatMessage(labels.title)}
                name="title"
                initialValue={title_text}
                rules={[
                  {
                    required: true,
                    min: 1,
                    message: helpTxt,
                  },
                ]}
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
          <SoftwareEnvironment onChange={onChangeHandler} />
        </Row>
        <SelectNewHost
          disabled={state === "saving"}
          selectedHost={selectedHost}
          onChange={setSelectedHost}
        />
        {render_add_license()}
        {render_license()}
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

  function render_project_creation(): React.JSX.Element | undefined {
    if (state === "view") return;
    return (
      <>
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
        <HostPickerModal
          open={hostPickerOpen}
          currentHostId={selectedHost?.id}
          onCancel={() => setHostPickerOpen(false)}
        onSelect={(_, host) => {
          setHostPickerOpen(false);
          setSelectedHost(host);
        }}
      />
      </>
    );
  }

  return (
    <div>
      {render_new_project_button()}
      {render_project_creation()}
    </div>
  );
}
