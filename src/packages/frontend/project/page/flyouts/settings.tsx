/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { ReloadOutlined } from "@ant-design/icons";
import { Button, Collapse, CollapseProps, Space, Tooltip } from "antd";
import { useIntl } from "react-intl";
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
import { IntlMessage, isIntlMessage, labels } from "@cocalc/frontend/i18n";
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
import ProjectControlError from "@cocalc/frontend/project/settings/project-control-error";

interface Props {
  project_id: string;
  wrap: (content: React.JSX.Element) => React.JSX.Element;
}

export function SettingsFlyout(_: Readonly<Props>): React.JSX.Element {
  const { project_id, wrap } = _;
  const intl = useIntl();
  const { status, project } = useProjectContext();
  const account_id = useTypedRedux("account", "account_id");
  const actions = useActions({ project_id });
  const active_top_tab = useTypedRedux("page", "active_top_tab");
  const projectIsVisible = active_top_tab === project_id;
  const [datastoreReload, setDatastoreReload] = useState<number>(0);
  const [expandedPanels, setExpandedPanels] = useState<string[]>([]);
  const configuration_loading = useTypedRedux(
    { project_id },
    "configuration_loading",
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

  function renderI18N(msg: string | IntlMessage): string {
    if (isIntlMessage(msg)) {
      return intl.formatMessage(msg);
    } else {
      return msg;
    }
  }

  function renderState() {
    if (status == null) return <Loading />;
    const s = status?.get("state");
    const iconName = COMPUTE_STATES[s]?.icon;
    const str = COMPUTE_STATES[s]?.display ?? s;

    const display = (
      <>
        <Icon name={iconName as IconName} /> {renderI18N(str)}
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

  function renderStatus(): React.JSX.Element | undefined {
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
          <RestartProject project_id={project_id} />
          <StopProject
            project_id={project_id}
            disabled={status.get("state") !== "running"}
          />
        </Button.Group>
        <ProjectControlError style={{ marginTop: "15px" }} />
      </div>
    );
  }

  function renderOther(): React.JSX.Element {
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

    const items: CollapseProps["items"] = [
      {
        key: "about",
        label: (
          <>
            <Icon name="file-alt" /> About
          </>
        ),
        children:
          project == null ? (
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
          ),
      },

      {
        key: "control",
        label: (
          <>
            <Icon name="gears" /> Control
          </>
        ),
        children: <ProjectControl project={project} mode="flyout" />,
      },

      {
        key: "hide-delete",
        label: (
          <>
            <Icon name="warning" /> Hide or Delete
          </>
        ),
        children: (
          <HideDeleteBox
            project={project}
            actions={redux.getActions("projects")}
            mode="flyout"
          />
        ),
      },

      {
        key: "api",
        label: (
          <>
            <Icon name="api" /> API Keys
          </>
        ),
        className: "cc-project-flyout-settings-panel",
        children: <ApiKeys project_id={project_id} mode="flyout" />,
      },
    ];

    if (showSSH) {
      items.push({
        key: "ssh",
        label: (
          <>
            <Icon name="list-ul" /> {intl.formatMessage(labels.ssh_keys)}
          </>
        ),
        children: (
          <SSHPanel
            mode="flyout"
            key="ssh-keys"
            project={project}
            account_id={account_id}
          />
        ),
      });
    }

    items.push({
      key: "env",
      label: (
        <>
          <Icon name={ENV_VARS_ICON} /> Environment Variables
        </>
      ),
      className: "cc-project-flyout-settings-panel",
      children: <Environment project_id={project_id} mode="flyout" />,
    });

    if (showDatastore) {
      items.push({
        key: "datastore",
        label: (
          <>
            <Icon name="database" /> {DATASTORE_TITLE}
          </>
        ),
        className: "cc-project-flyout-settings-panel",
        extra: renderDatastoreRelaod(),
        children: (
          <Datastore
            project_id={project_id}
            mode="flyout"
            reloadTrigger={datastoreReload}
          />
        ),
      });
    }

    items.push({
      key: "features",
      label: (
        <>
          <Icon name="clipboard-check" /> Features and Configuration
        </>
      ),
      style: { borderRadius: 0 },
      extra: featuresRealodButton(),
      children: (
        <ProjectCapabilities
          project={project}
          project_id={project_id}
          mode="flyout"
        />
      ),
    });

    return (
      <Collapse
        style={{ borderRadius: 0, borderLeft: "none", borderRight: "none" }}
        activeKey={expandedPanels}
        onChange={(keys) => setExpandedPanelsHandler(keys as string[])}
        destroyOnHidden={true}
        items={items}
      />
    );
  }

  return wrap(
    <Space direction="vertical" style={{ padding: "0", width: "100%" }}>
      {renderStatus()}
      {renderSettings()}
      {renderOther()}
    </Space>,
  );
}
