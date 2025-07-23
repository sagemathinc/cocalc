/*
 *  This file is part of CoCalc: Copyright © 2024 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
Configuration copying.

- Select one or more other course files
  - explicitly enter file path in current project
  - also support other projects that you have access to
  - use the "search all files you edited in the last year" feature (that's in projects)
  - use find command in specific project: find . -xdev -type f \( -name "*.course" ! -name ".*" \)
  - a name field (for customizing things)

- Select which configuration to share (and parameters)

- Click a button to copy the configuration from this course
  to the target courses.

- For title and description, config could be a template based on course name or filename.
*/

import {
  Alert,
  Button,
  Card,
  Checkbox,
  Divider,
  Input,
  Popconfirm,
  Space,
  Spin,
  Tooltip,
} from "antd";
import { useMemo, useState } from "react";
import { FormattedMessage, useIntl } from "react-intl";

import { labels } from "@cocalc/frontend/i18n";
import {
  redux,
  useFrameContext,
  useTypedRedux,
} from "@cocalc/frontend/app-framework";
import { Icon } from "@cocalc/frontend/components";
import ShowError from "@cocalc/frontend/components/error";
import { COMMANDS } from "@cocalc/frontend/course/commands";
import { exec } from "@cocalc/frontend/frame-editors/generic/client";
import { IntlMessage } from "@cocalc/frontend/i18n";
import { pathExists } from "@cocalc/frontend/project/directory-selector";
import { ProjectTitle } from "@cocalc/frontend/projects/project-title";
import { isIntlMessage } from "@cocalc/util/i18n";
import { plural } from "@cocalc/util/misc";
import { CONFIGURATION_GROUPS, ConfigurationGroup } from "./actions";
import { COLORS } from "@cocalc/util/theme";

export type CopyConfigurationOptions = {
  [K in ConfigurationGroup]?: boolean;
};

export interface CopyConfigurationTargets {
  [project_id_path: string]: boolean | null;
}

interface Props {
  settings;
  project_id;
  actions;
  close?: Function;
}

export default function ConfigurationCopying({
  settings,
  project_id,
  actions,
  close,
}: Props) {
  const intl = useIntl();

  const [error, setError] = useState<string>("");
  const { numTargets, numOptions } = useMemo(() => {
    const targets = getTargets(settings);
    const options = getOptions(settings);
    return { numTargets: numTrue(targets), numOptions: numTrue(options) };
  }, [settings]);
  const [copying, setCopying] = useState<boolean>(false);

  const copyConfiguration = async () => {
    try {
      setCopying(true);
      setError("");
      const targets = getTargets(settings);
      const options = getOptions(settings);
      const t: { project_id: string; path: string }[] = [];
      for (const key in targets) {
        if (targets[key] === true) {
          t.push(parseKey(key));
        }
      }
      const g: ConfigurationGroup[] = [];
      for (const key in options) {
        if (options[key] === true) {
          g.push(key as ConfigurationGroup);
        }
      }
      await actions.configuration.copyConfiguration({
        groups: g,
        targets: t,
      });
    } catch (err) {
      setError(`${err}`);
    } finally {
      setCopying(false);
    }
  };

  const title = intl.formatMessage({
    id: "course.configuration-copying.title",
    defaultMessage: "Copy Course Configuration",
  });

  return (
    <Card
      title={
        <>
          <Icon name="copy" /> {title}
        </>
      }
    >
      <div style={{ color: COLORS.GRAY_M }}>
        <FormattedMessage
          id="course.configuration-copying.info"
          defaultMessage={`Copy configuration from this course to other courses.
          If you divide a large course into multiple smaller sections,
          you can list each of the other .course files below,
          then easily open any or all of them,
          and copy configuration from this course to them.`}
        />
      </div>
      <div style={{ textAlign: "center", margin: "15px 0" }}>
        <Button
          size="large"
          disabled={numTargets == 0 || numOptions == 0 || copying}
          onClick={copyConfiguration}
        >
          <Icon name="copy" />
          Copy{copying ? "ing" : ""} {numOptions}{" "}
          {plural(numOptions, "configuration item")} to {numTargets}{" "}
          {plural(numTargets, "target course")} {copying && <Spin />}
        </Button>
      </div>
      <ShowError style={{ margin: "15px" }} error={error} setError={setError} />
      <ConfigTargets
        actions={actions}
        project_id={project_id}
        settings={settings}
        numTargets={numTargets}
        close={close}
      />
      <ConfigOptions
        settings={settings}
        actions={actions}
        numOptions={numOptions}
      />
    </Card>
  );
}

function parseKey(project_id_path: string): {
  project_id: string;
  path: string;
} {
  return {
    project_id: project_id_path.slice(0, 36),
    path: project_id_path.slice(37),
  };
}

function getTargets(settings) {
  return (settings.get("copy_config_targets")?.toJS() ??
    {}) as CopyConfigurationTargets;
}

function ConfigTargets({
  settings,
  actions,
  project_id: course_project_id,
  numTargets,
  close,
}) {
  const targets = getTargets(settings);
  const v: React.JSX.Element[] = [];
  const keys = Object.keys(targets);
  keys.sort();
  for (const key of keys) {
    const val = targets[key];
    if (val == null) {
      // deleted
      continue;
    }
    const { project_id, path } = parseKey(key);
    v.push(
      <div key={key} style={{ display: "flex" }}>
        <div style={{ flex: 1 }}>
          <Checkbox
            checked={val}
            onChange={(e) => {
              const copy_config_targets = {
                ...targets,
                [key]: e.target.checked,
              };
              actions.set({ copy_config_targets, table: "settings" });
            }}
          >
            {path}
            {project_id != course_project_id ? (
              <>
                {" "}
                in <ProjectTitle project_id={project_id} />
              </>
            ) : undefined}
          </Checkbox>
          <Tooltip
            mouseEnterDelay={1}
            title={
              <>Open {path} in a new tab. (Use shift to open in background.)</>
            }
          >
            <Button
              type="link"
              size="small"
              onClick={(e) => {
                const foreground =
                  !e.shiftKey && !e.ctrlKey && !e.altKey && !e.metaKey;
                redux
                  .getProjectActions(project_id)
                  .open_file({ path, foreground });
                if (foreground) {
                  close?.();
                }
              }}
            >
              <Icon name="external-link" />
            </Button>
          </Tooltip>
        </div>
        <div>
          <Popconfirm
            title={<>Remove {path} from copy targets?</>}
            onConfirm={() => {
              const copy_config_targets = {
                ...targets,
                [key]: null,
              };
              actions.set({ copy_config_targets, table: "settings" });
            }}
          >
            <Tooltip
              mouseEnterDelay={1}
              title={<>Remove {path} from copy targets?</>}
            >
              <Button size="small" type="link">
                <Icon name="trash" />
              </Button>
            </Tooltip>
          </Popconfirm>
        </div>
      </div>,
    );
  }
  v.push(
    <div key="add">
      <AddTarget
        settings={settings}
        actions={actions}
        project_id={course_project_id}
      />
    </div>,
  );

  const openAll = () => {
    for (const key in targets) {
      if (targets[key] !== true) {
        continue;
      }
      const { project_id, path } = parseKey(key);
      redux
        .getProjectActions(project_id)
        .open_file({ path, foreground: false });
    }
  };

  return (
    <div>
      <div style={{ display: "flex" }}>
        <div style={{ flex: 1 }}>
          <Divider>
            Courses to Configure{" "}
            <Tooltip
              mouseEnterDelay={1}
              title="Open all selected targets in background tabs."
            >
              <a onClick={openAll}>(open all)</a>
            </Tooltip>
          </Divider>
        </div>
        <Space style={{ margin: "0 15px" }}>
          <Button
            disabled={numTargets == 0}
            size="small"
            onClick={() => {
              const copy_config_targets = {} as CopyConfigurationTargets;
              for (const key of keys) {
                copy_config_targets[key] = false;
              }
              actions.set({ copy_config_targets, table: "settings" });
            }}
          >
            None
          </Button>
          <Button
            disabled={numFalse(targets) == 0}
            size="small"
            onClick={() => {
              const copy_config_targets = {} as CopyConfigurationTargets;
              for (const key of keys) {
                copy_config_targets[key] = true;
              }
              actions.set({ copy_config_targets, table: "settings" });
            }}
          >
            All
          </Button>
        </Space>
      </div>
      {v}
    </div>
  );
}

function getOptions(settings) {
  return (settings.get("copy_config_options")?.toJS() ??
    {}) as CopyConfigurationOptions;
}

function ConfigOptions({ settings, actions, numOptions }) {
  const intl = useIntl();

  function formatMesg(msg: string | IntlMessage): string {
    if (isIntlMessage(msg)) {
      return intl.formatMessage(msg);
    } else {
      return msg;
    }
  }

  const options = getOptions(settings);
  const v: React.JSX.Element[] = [];
  for (const option of CONFIGURATION_GROUPS) {
    const { title, label, icon } = COMMANDS[option] ?? {};
    v.push(
      <div key={option}>
        <Tooltip title={formatMesg(title)} mouseEnterDelay={1}>
          <Checkbox
            checked={options[option]}
            onChange={(e) => {
              const copy_config_options = {
                ...options,
                [option]: e.target.checked,
              };
              actions.set({ copy_config_options, table: "settings" });
            }}
          >
            <Icon name={icon} /> {formatMesg(label)}
          </Checkbox>
        </Tooltip>
      </div>,
    );
  }
  return (
    <div>
      <div style={{ display: "flex" }}>
        <div style={{ flex: 1 }}>
          <Divider>Configuration to Copy</Divider>
        </div>
        <Space style={{ margin: "0 15px" }}>
          <Button
            disabled={numOptions == 0}
            size="small"
            onClick={() => {
              const copy_config_options = {} as CopyConfigurationOptions;
              for (const option of CONFIGURATION_GROUPS) {
                copy_config_options[option] = false;
              }
              actions.set({ copy_config_options, table: "settings" });
            }}
          >
            None
          </Button>
          <Button
            disabled={numOptions == CONFIGURATION_GROUPS.length}
            size="small"
            onClick={() => {
              const copy_config_options = {} as CopyConfigurationOptions;
              for (const option of CONFIGURATION_GROUPS) {
                copy_config_options[option] = true;
              }
              actions.set({ copy_config_options, table: "settings" });
            }}
          >
            All
          </Button>
        </Space>
      </div>

      {v}
    </div>
  );
}

function numTrue(dict) {
  let n = 0;
  for (const a in dict) {
    if (dict[a] === true) {
      n += 1;
    }
  }
  return n;
}

function numFalse(dict) {
  let n = 0;
  for (const a in dict) {
    if (dict[a] === false) {
      n += 1;
    }
  }
  return n;
}

function AddTarget({ settings, actions, project_id }) {
  const intl = useIntl();
  const { path: course_path } = useFrameContext();
  const [adding, setAdding] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);
  const [path, setPath] = useState<string>("");
  const [error, setError] = useState<string>("");
  const [create, setCreate] = useState<string>("");
  const directoryListings = useTypedRedux(
    { project_id },
    "directory_listings",
  )?.get(0);

  const add = async () => {
    try {
      setError("");
      if (path == course_path) {
        throw Error(`'${path} is the current course'`);
      }
      setLoading(true);
      const exists = await pathExists(project_id, path, directoryListings);
      if (!exists) {
        if (create) {
          await exec({
            command: "touch",
            args: [path],
            project_id,
            filesystem: true,
          });
        } else {
          setCreate(path);
          return;
        }
      }
      const copy_config_targets = getTargets(settings);
      copy_config_targets[`${project_id}/${path}`] = true;
      actions.set({ copy_config_targets, table: "settings" });
      setPath("");
      setAdding(false);
      setCreate("");
    } catch (err) {
      setError(`${err}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <div style={{ marginTop: "5px", width: "100%", display: "flex" }}>
        <Button
          disabled={adding || loading}
          onClick={() => {
            setAdding(true);
            setPath("");
          }}
        >
          <Icon name="plus-circle" /> Add Course...
        </Button>
        {adding && (
          <Space.Compact style={{ width: "100%", flex: 1, margin: "0 15px" }}>
            <Input
              autoFocus
              disabled={loading}
              allowClear
              style={{ width: "100%" }}
              placeholder="Filename of .course file (e.g., 'a.course')"
              onChange={(e) => setPath(e.target.value)}
              value={path}
              onPressEnter={add}
            />
            <Button
              type="primary"
              onClick={add}
              disabled={loading || !path.endsWith(".course")}
            >
              <Icon name="save" /> Add
              {loading && <Spin style={{ marginLeft: "5px" }} />}
            </Button>
          </Space.Compact>
        )}
        {adding && (
          <Button
            disabled={loading}
            onClick={() => {
              setAdding(false);
              setCreate("");
              setPath("");
            }}
          >
            {intl.formatMessage(labels.cancel)}
          </Button>
        )}
      </div>

      {create && create == path && (
        <Alert
          style={{ marginTop: "15px" }}
          type="warning"
          message={
            <div>
              {path} does not exist.{" "}
              <Button disabled={loading} onClick={add}>
                {loading ? (
                  <>
                    Creating... <Spin />
                  </>
                ) : (
                  "Create?"
                )}
              </Button>
            </div>
          }
        />
      )}
      <ShowError
        style={{ marginTop: "15px" }}
        error={error}
        setError={setError}
      />
    </div>
  );
}
