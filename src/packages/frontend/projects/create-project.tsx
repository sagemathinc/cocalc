/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
Create a new project
*/

import { Button, Card, Col, Form, Input, Modal, Row, Select } from "antd";
import { delay } from "awaiting";
import { FormattedMessage, useIntl } from "react-intl";

import {
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
import track from "@cocalc/frontend/user-tracking";
// import { DEFAULT_COMPUTE_IMAGE } from "@cocalc/util/db-schema";
import {
  DEFAULT_R2_REGION,
  mapCloudRegionToR2Region,
  R2_REGION_LABELS,
  R2_REGIONS,
  type R2Region,
} from "@cocalc/util/consts";
import { capitalize } from "@cocalc/util/misc";
import type { Host } from "@cocalc/conat/hub/api/hosts";
import { SelectNewHost } from "@cocalc/frontend/hosts/select-new-host";


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
  const projectLabel = intl.formatMessage(labels.project);
  const projectLabelLower = projectLabel.toLowerCase();
  const projectsLabel = intl.formatMessage(labels.projects);
  // view --> edit --> saving --> view
  const [state, set_state] = useState<EditState>(noProjects ? "edit" : "view");
  const [title_text, set_title_text] = useState<string>(
    default_value ?? getDefaultTitle(),
  );
  const [error, set_error] = useState<string>("");
  const [title_manually, set_title_manually] = useState<boolean>(
    default_value.length > 0,
  );
  const [selected, setSelected] = useState<SoftwareEnvironmentState>({});
  const new_project_title_ref = useRef<any>(null);
  const compute_servers_enabled = useTypedRedux(
    "customize",
    "compute_servers_enabled",
  );
  const [selectedHost, setSelectedHost] = useState<Host | undefined>();
  const [projectRegion, setProjectRegion] =
    useState<R2Region>(DEFAULT_R2_REGION);
  const regionOptions = useMemo(
    () =>
      R2_REGIONS.map((region) => ({
        value: region,
        label: R2_REGION_LABELS[region],
      })),
    [],
  );

  const [form] = Form.useForm();

  useEffect(() => {
    form.setFieldsValue({ title: title_text });
  }, [title_text]);

  useEffect(() => {
    set_title_manually(default_value.length > 0);
  }, [default_value.length > 0]);

  useEffect(() => {
    if (!selectedHost) return;
    const hostRegion = mapCloudRegionToR2Region(selectedHost.region);
    if (hostRegion !== projectRegion) {
      setSelectedHost(undefined);
    }
  }, [projectRegion, selectedHost]);

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
    setProjectRegion(DEFAULT_R2_REGION);
    select_text();
  }

  function cancel_editing(): void {
    if (!is_mounted_ref.current) return;
    set_state("view");
    set_title_text(default_value || getDefaultTitle());
    set_error("");
    setSelected({});
    set_title_manually(false);
    setSelectedHost(undefined);
    setProjectRegion(DEFAULT_R2_REGION);
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
      start: true,
      host_id: selectedHost?.id,
      region: projectRegion,
    };
    try {
      project_id = await actions.create_project(opts);
    } catch (err) {
      if (!is_mounted_ref.current) return;
      set_state("edit");
      set_error(`Error creating ${projectLabelLower} -- ${err}`);
      return;
    }
    track("create-project", {
      how: "projects-page",
      project_id,
      ...opts,
    });
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

  function render_new_project_button(): React.JSX.Element | undefined {
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
            {capitalize(intl.formatMessage(labels.create))}
          </Button>
        </Col>
      </Row>
    );
  }

  function isDisabled() {
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
                  placeholder={`Name your new ${projectLabelLower}...`}
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
                defaultMessage={`A <A1>{projectLabel}</A1> is a private computational environment
                  where you can work with collaborators that you explicitly invite.
                  {compute_servers_enabled, select,
                  true {You can attach powerful <A2>GPUs, CPUs</A2> and <A3>storage</A3> to a {projectLabel}.}
                  other {}}`}
                values={{
                  compute_servers_enabled,
                  projectLabel: projectLabelLower,
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
        <Row gutter={[30, 10]} style={{ paddingTop: 10 }}>
          <Col sm={12}>
            <Card size="small" bodyStyle={{ padding: "10px 12px" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <div style={{ fontWeight: 600 }}>Backup region</div>
                <Select
                  value={projectRegion}
                  onChange={(value) => setProjectRegion(value as R2Region)}
                  options={regionOptions}
                  disabled={state === "saving"}
                />
              </div>
            </Card>
          </Col>
          <Col sm={12}>
            <Paragraph type="secondary">
              Backups are stored in this region. {projectsLabel} can only run on
              hosts in the same region.
            </Paragraph>
          </Col>
        </Row>
        <SelectNewHost
          disabled={state === "saving"}
          selectedHost={selectedHost}
          onChange={setSelectedHost}
          regionFilter={projectRegion}
          regionLabel={R2_REGION_LABELS[projectRegion]}
        />
        {render_error()}
      </>
    );
  }

  function renderOKButtonText() {
    return capitalize(intl.formatMessage(labels.create));
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
        {/* Host picker handled inside SelectNewHost */}
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
