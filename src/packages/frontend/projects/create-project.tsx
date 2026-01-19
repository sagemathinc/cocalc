/*
 *  This file is part of CoCalc: Copyright (c) 2020 Sagemath, Inc.
 *  License: MS-RSL - see LICENSE.md for details
 */

/*
Create a new project
*/

import { Button, Card, Form, Input, Select, Space, Typography } from "antd";
import { delay } from "awaiting";
import { FormattedMessage, useIntl } from "react-intl";

import {
  redux,
  useEffect,
  useIsMountedRef,
  useMemo,
  useRef,
  useState,
} from "@cocalc/frontend/app-framework";
import { A, ErrorDisplay, Icon, Paragraph } from "@cocalc/frontend/components";
import {
  derive_project_img_name,
  SoftwareEnvironment,
  SoftwareEnvironmentState,
} from "@cocalc/frontend/custom-software/selector";
import { labels } from "@cocalc/frontend/i18n";
import track from "@cocalc/frontend/user-tracking";
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
  default_value: string;
  open: boolean;
  onClose: () => void;
}

export function NewProjectCreator({
  default_value,
  open,
  onClose,
}: Props) {
  const intl = useIntl();
  const projectLabel = intl.formatMessage(labels.project);
  const projectLabelLower = projectLabel.toLowerCase();
  const projectsLabel = intl.formatMessage(labels.projects);
  const { Title } = Typography;

  const [title_text, set_title_text] = useState<string>(
    default_value ?? getDefaultTitle(),
  );
  const [error, set_error] = useState<string>("");
  const [showAdvanced, setShowAdvanced] = useState<boolean>(false);
  const [title_manually, set_title_manually] = useState<boolean>(
    default_value.length > 0,
  );
  const [saving, setSaving] = useState<boolean>(false);
  const [selected, setSelected] = useState<SoftwareEnvironmentState>({});
  const new_project_title_ref = useRef<any>(null);
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

  function reset_form(): void {
    set_title_text(default_value || getDefaultTitle());
    setProjectRegion(DEFAULT_R2_REGION);
    setSelected({});
    set_title_manually(false);
    setSelectedHost(undefined);
    setShowAdvanced(false);
    set_error("");
    setSaving(false);
  }

  function start_editing(): void {
    reset_form();
    select_text();
  }

  function cancel_editing(): void {
    if (!is_mounted_ref.current) return;
    reset_form();
    onClose();
  }

  async function create_project(): Promise<void> {
    setSaving(true);
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
      setSaving(false);
      setShowAdvanced(true);
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
    return <ErrorDisplay error={error} onClose={() => set_error("")} />;
  }

  function isDisabled() {
    return (
      // no name of new project
      !title_text?.trim() ||
      // currently saving (?)
      saving ||
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
    // only change the project title, if the user has not manually set it or it is empty - or if it is a custom image
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
      <Space direction="vertical" size="middle" style={{ width: "100%" }}>
        <Form form={form} layout="vertical">
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
              disabled={saving}
              onChange={input_on_change}
              onKeyDown={handle_keypress}
              autoFocus
            />
          </Form.Item>
        </Form>
        <Button
          type="link"
          onClick={() => setShowAdvanced((prev) => !prev)}
          style={{ paddingLeft: 0 }}
        >
          {showAdvanced ? "Hide advanced" : "Show advanced"}
        </Button>
        {showAdvanced && (
          <Space direction="vertical" size="middle" style={{ width: "100%" }}>
            <Paragraph type="secondary">
              <FormattedMessage
                id="projects.create-project.explanation"
                defaultMessage={`A <A1>{projectLabel}</A1> is a private computational environment
                  where you can work with collaborators that you explicitly invite.`}
                values={{
                  projectLabel: projectLabelLower,
                  A1: (c) => (
                    <A href="https://doc.cocalc.com/project.html">{c}</A>
                  ),
                }}
              />
            </Paragraph>
            <SoftwareEnvironment onChange={onChangeHandler} />
            <Card size="small" bodyStyle={{ padding: "10px 12px" }}>
              <Space direction="vertical" size="small" style={{ width: "100%" }}>
                <div style={{ fontWeight: 600 }}>Backup region</div>
                <Select
                  value={projectRegion}
                  onChange={(value) => setProjectRegion(value as R2Region)}
                  options={regionOptions}
                  disabled={saving}
                />
                <Paragraph type="secondary" style={{ marginBottom: 0 }}>
                  Backups are stored in this region. {projectsLabel} can only run
                  on hosts in the same region.
                </Paragraph>
              </Space>
            </Card>
            <SelectNewHost
              disabled={saving}
              selectedHost={selectedHost}
              onChange={setSelectedHost}
              regionFilter={projectRegion}
              regionLabel={R2_REGION_LABELS[projectRegion]}
              pickerMode="create"
            />
          </Space>
        )}
        {render_error()}
      </Space>
    );
  }

  useEffect(() => {
    if (open) {
      start_editing();
    } else {
      reset_form();
    }
  }, [open]);

  if (!open) return null;

  return (
    <Space direction="vertical" size="middle" style={{ width: "100%" }}>
      <div>
        <Title level={4} style={{ marginBottom: 4 }}>
          {intl.formatMessage(labels.create_project)}
        </Title>
        <Paragraph type="secondary" style={{ marginBottom: 0 }}>
          Pick a title now and tune the rest later.
        </Paragraph>
      </div>
      {render_input_section()}
      <Space>
        <Button onClick={cancel_editing} disabled={saving}>
          {intl.formatMessage(labels.cancel)}
        </Button>
        <Button
          type="primary"
          onClick={create_project}
          disabled={isDisabled()}
          loading={saving}
          icon={<Icon name="plus-circle" />}
        >
          {capitalize(intl.formatMessage(labels.create))}
        </Button>
      </Space>
    </Space>
  );
}
