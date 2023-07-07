/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { ReloadOutlined } from "@ant-design/icons";
import { Button, Collapse, Space, Tooltip } from "antd";

import {
  redux,
  useActions,
  useEffect,
  useState,
  useTypedRedux,
} from "@cocalc/frontend/app-framework";
import {
  Icon,
  IconName,
  Loading,
  Paragraph,
  Title,
} from "@cocalc/frontend/components";
import { getStudentProjectFunctionality } from "@cocalc/frontend/course";
import { useProjectContext } from "@cocalc/frontend/project/context";
import { AboutBox } from "@cocalc/frontend/project/settings/about-box";
import { ApiKeys } from "@cocalc/frontend/project/settings/api-keys";
import { Datastore } from "@cocalc/frontend/project/settings/datastore";
import {
  ENV_VARS_ICON,
  Environment,
} from "@cocalc/frontend/project/settings/environment";
import { HideDeleteBox } from "@cocalc/frontend/project/settings/hide-delete-box";
import { ProjectCapabilities } from "@cocalc/frontend/project/settings/project-capabilites";
import { ProjectControl } from "@cocalc/frontend/project/settings/project-control";
import { RestartProject } from "@cocalc/frontend/project/settings/restart-project";
import { SSHPanel } from "@cocalc/frontend/project/settings/ssh";
import { StopProject } from "@cocalc/frontend/project/settings/stop-project";
import { COMPUTE_STATES } from "@cocalc/util/compute-states";
import {
  DATASTORE_TITLE,
  KUCALC_COCALC_COM,
  KUCALC_ON_PREMISES,
} from "@cocalc/util/db-schema/site-defaults";
import { FIX_BORDER } from "../common";
import { FLYOUT_PADDING } from "./consts";
import { getFlyoutSettings, storeFlyoutState } from "./state";

interface Props {
  project_id: string;
  wrap: (content: JSX.Element) => JSX.Element;
}

export function SettingsFlyout(_: Readonly<Props>): JSX.Element {
  const { project_id, wrap } = _;

  const { status, project } = useProjectContext();
  const account_id = useTypedRedux("account", "account_id");
  const actions = useActions({ project_id });
  const active_top_tab = useTypedRedux("page", "active_top_tab");
  const projectIsVisible = active_top_tab === project_id;
  const [datastoreReload, setDatastoreReload] = useState<number>(0);
  const [expandedPanels, setExpandedPanels] = useState<string[]>([]);
  const configuration_loading = useTypedRedux(
    { project_id },
    "configuration_loading"
  );
  const kucalc = useTypedRedux("customize", "kucalc");
  const datastore = useTypedRedux("customize", "datastore");
  const ssh_gateway = useTypedRedux("customize", "ssh_gateway");
  const student = getStudentProjectFunctionality(project_id);
  const showSSH =
    !student.disableSSH && (ssh_gateway || kucalc === KUCALC_COCALC_COM);
  const showDatastore =
    kucalc === KUCALC_COCALC_COM ||
    (kucalc === KUCALC_ON_PREMISES && datastore);

  useEffect(() => {
    const state = getFlyoutSettings(project_id);
    setExpandedPanels(state);
  }, []);

  function renderState() {
    if (status == null) return <Loading />;
    const s = status?.get("state");
    const iconName = COMPUTE_STATES[s]?.icon;
    const str = COMPUTE_STATES[s]?.display ?? s;

    const display = (
      <>
        <Icon name={iconName as IconName} /> {str}
      </>
    );

    switch (
      s as any // TODO: is "pending" a "ProjectStatus"?
    ) {
      case "running":
        return <span style={{ color: "green" }}>{display}</span>;
      case "starting":
        return <span style={{ color: "orange" }}>{display}</span>;
      case "pending":
        return <span style={{ color: "orange" }}>{display}</span>;
      case "stopping":
        return <span style={{ color: "orange" }}>{display}</span>;
      case "closed":
      case "archived":
      case "opened":
        return <span style={{ color: "red" }}>{display}</span>;
      default:
        console.warn(`Unknown project state: ${s}`);
        return <span style={{ color: "red" }}>Unknown</span>;
    }
  }

  function renderStatus(): JSX.Element | undefined {
    // this prevents the start/stop popup dialog to stick around, if we switch somewhere else
    if (!projectIsVisible) return;
    return (
      <div
        style={{
          padding: FLYOUT_PADDING,
          marginBottom: "20px",
        }}
      >
        <Title level={4}>
          Status: <span style={{ float: "right" }}>{renderState()}</span>
        </Title>
        <Button.Group>
          <RestartProject project_id={project_id} short={true} />
          <StopProject
            project_id={project_id}
            disabled={status.get("state") !== "running"}
            short={true}
          />
        </Button.Group>
      </div>
    );
  }

  function renderOther(): JSX.Element {
    return (
      <Paragraph
        type="secondary"
        style={{
          padding: FLYOUT_PADDING,
          borderTop: FIX_BORDER,
          paddingTop: "20px",
          marginTop: "20px",
        }}
      >
        Where are Licenses and Quotas? They moved to their{" "}
        <a
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            actions?.toggleFlyout("upgrades");
          }}
        >
          dedicated panel
        </a>
        .
      </Paragraph>
    );
  }

  function setExpandedPanelsHandler(keys: string[]) {
    setExpandedPanels(keys);
    storeFlyoutState(project_id, "settings", {
      settings: keys,
    });
  }

  function featuresRealodButton() {
    return (
      <Tooltip title="Reload features and configuration">
        <Button
          size="small"
          onClick={(e) => {
            e.stopPropagation();
            const pa = redux.getProjectActions(project_id);
            pa.reload_configuration();
          }}
          icon={<ReloadOutlined />}
          disabled={configuration_loading}
        />
      </Tooltip>
    );
  }

  function renderDatastoreRelaod() {
    return (
      <Tooltip title={`Reload ${DATASTORE_TITLE} information`}>
        <Button
          size="small"
          icon={<ReloadOutlined />}
          onClick={(e) => {
            e.stopPropagation();
            setDatastoreReload((prev) => prev + 1);
          }}
        />
      </Tooltip>
    );
  }

  function renderSettings() {
    if (project == null) return <Loading theme="medium" transparent />;
    return (
      <Collapse
        style={{ borderRadius: 0, borderLeft: "none", borderRight: "none" }}
        activeKey={expandedPanels}
        onChange={(keys) => setExpandedPanelsHandler(keys as string[])}
        destroyInactivePanel={true}
      >
        <Collapse.Panel
          key="about"
          header={
            <>
              <Icon name="file-alt" /> About
            </>
          }
        >
          {project == null ? (
            <Loading theme="medium" transparent />
          ) : (
            <AboutBox
              mode="flyout"
              project_id={project_id}
              project_title={project.get("title") ?? ""}
              description={project.get("description") ?? ""}
              created={project.get("created")}
              name={project.get("name")}
              actions={redux.getActions("projects")}
            />
          )}
        </Collapse.Panel>
        <Collapse.Panel
          key="control"
          header={
            <>
              <Icon name="gears" /> Control
            </>
          }
        >
          <ProjectControl project={project} mode="flyout" />
        </Collapse.Panel>
        <Collapse.Panel
          key="hide-delete"
          header={
            <>
              <Icon name="warning" /> Hide or Delete
            </>
          }
        >
          <HideDeleteBox
            project={project}
            actions={redux.getActions("projects")}
            mode="flyout"
          />
        </Collapse.Panel>
        <Collapse.Panel
          key="api"
          header={
            <>
              <Icon name="api" /> API Keys
            </>
          }
          className={"cc-project-flyout-settings-panel"}
        >
          <ApiKeys project_id={project_id} mode="flyout" />
        </Collapse.Panel>
        {showSSH ? (
          <Collapse.Panel
            key="ssh"
            header={
              <>
                <Icon name="list-ul" /> SSH Keys
              </>
            }
          >
            <SSHPanel
              mode="flyout"
              key="ssh-keys"
              project={project}
              account_id={account_id}
            />
          </Collapse.Panel>
        ) : undefined}
        <Collapse.Panel
          key="env"
          header={
            <>
              <Icon name={ENV_VARS_ICON} /> Environment Variables
            </>
          }
          className={"cc-project-flyout-settings-panel"}
        >
          <Environment project_id={project_id} mode="flyout" />
        </Collapse.Panel>
        {showDatastore ? (
          <Collapse.Panel
            className={"cc-project-flyout-settings-panel"}
            key="datastore"
            header={
              <>
                <Icon name="database" /> {DATASTORE_TITLE}
              </>
            }
            extra={renderDatastoreRelaod()}
          >
            <Datastore
              project_id={project_id}
              mode="flyout"
              reloadTrigger={datastoreReload}
            />
          </Collapse.Panel>
        ) : undefined}
        <Collapse.Panel
          key="features"
          header={
            <>
              <Icon name="clipboard-check" /> Features and configuration
            </>
          }
          style={{ borderRadius: 0 }}
          extra={featuresRealodButton()}
        >
          <ProjectCapabilities
            project={project}
            project_id={project_id}
            mode="flyout"
          />
        </Collapse.Panel>
      </Collapse>
    );
  }

  return wrap(
    <Space direction="vertical" style={{ padding: "0", width: "100%" }}>
      {renderStatus()}
      {renderSettings()}
      {renderOther()}
    </Space>
  );
}
