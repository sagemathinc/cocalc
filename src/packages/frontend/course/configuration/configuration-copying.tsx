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

import { Button, Card, Checkbox, Input, Space, Spin, Tooltip } from "antd";
import ShowError from "@cocalc/frontend/components/error";
import { Icon } from "@cocalc/frontend/components";
import { useMemo, useState } from "react";
import { pathExists } from "@cocalc/frontend/project/directory-selector";
import { useTypedRedux } from "@cocalc/frontend/app-framework";
import { COMMANDS } from "@cocalc/frontend/course/commands";
import { ProjectTitle } from "@cocalc/frontend/projects/project-title";
import { plural } from "@cocalc/util/misc";

const COPY_OPTIONS = [
  "collaborator-policy",
  "email-invitation",
  "copy-limit",
  "restrict-student-projects",
  "nbgrader",
  "network-file-systems",
  "env-variables",
  "upgrades",
  "software-environment",
] as const;

type CopyOptionKeys = (typeof COPY_OPTIONS)[number];

export type CopyConfigurationOptions = {
  [K in CopyOptionKeys]?: boolean;
};

export interface CopyConfigurationTargets {
  [project_id_path: string]: boolean | null;
}

interface Props {
  settings;
  project_id;
  actions;
}

export default function ConfigurationCopying({
  settings,
  project_id,
  actions,
}: Props) {
  const { numTargets, numOptions } = useMemo(() => {
    const targets = (settings.get("copy_config_targets")?.toJS() ??
      {}) as CopyConfigurationTargets;
    const options = (settings.get("copy_config_options")?.toJS() ??
      {}) as CopyConfigurationOptions;
    return { numTargets: numTrue(targets), numOptions: numTrue(options) };
  }, [settings]);

  return (
    <Card
      title={
        <>
          <Icon name="envelope" /> Configuration Copying
        </>
      }
    >
      <ConfigTargets
        actions={actions}
        project_id={project_id}
        settings={settings}
        numTargets={numTargets}
      />
      <br />
      <ConfigOptions
        settings={settings}
        actions={actions}
        numOptions={numOptions}
      />
      <br />
      <Button disabled={numTargets == 0 || numOptions == 0}>
        Copy {numOptions} {plural(numOptions, "option")} to {numTargets}{" "}
        {plural(numTargets, "target")}
      </Button>
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
}) {
  const targets = getTargets(settings);
  const v: JSX.Element[] = [];
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
      <div key={key}>
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
  return (
    <div>
      <div style={{ display: "flex", marginBottom: "15px" }}>
        <b>Target Courses</b>
        <div style={{ flex: 1 }} />
        <Space>
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
            Clear
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
  const options = getOptions(settings);
  const v: JSX.Element[] = [];
  for (const option of COPY_OPTIONS) {
    const { title, label, icon } = COMMANDS[option] ?? {};
    v.push(
      <Tooltip key={option} title={title} mouseEnterDelay={1}>
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
          <Icon name={icon} /> {label}
        </Checkbox>
      </Tooltip>,
    );
  }
  return (
    <div>
      <div style={{ display: "flex", marginBottom: "15px" }}>
        <b>Configuration Items to Copy</b>
        <div style={{ flex: 1 }} />
        <Space>
          <Button
            disabled={numOptions == 0}
            size="small"
            onClick={() => {
              const copy_config_options = {} as CopyConfigurationOptions;
              for (const option of COPY_OPTIONS) {
                copy_config_options[option] = false;
              }
              actions.set({ copy_config_options, table: "settings" });
            }}
          >
            Clear
          </Button>
          <Button
            disabled={numOptions == COPY_OPTIONS.length}
            size="small"
            onClick={() => {
              const copy_config_options = {} as CopyConfigurationOptions;
              for (const option of COPY_OPTIONS) {
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
  const [adding, setAdding] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);
  const [path, setPath] = useState<string>("");
  const [error, setError] = useState<string>("");
  const directoryListings = useTypedRedux(
    { project_id },
    "directory_listings",
  )?.get(0);

  const add = async () => {
    try {
      setLoading(true);
      const exists = await pathExists(project_id, path, directoryListings);
      if (!exists) {
        throw Error(`${path} does not exist`);
      }
      const copy_config_targets = getTargets(settings);
      copy_config_targets[`${project_id}/${path}`] = true;
      actions.set({ copy_config_targets, table: "settings" });
      setPath("");
      setAdding(false);
    } catch (err) {
      setError(`${err}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <Space>
        <Button
          style={{ marginTop: "15px" }}
          disabled={adding || loading}
          onClick={() => {
            setAdding(true);
            setPath("");
          }}
        >
          <Icon name="plus-circle" /> Add Target...
        </Button>
        {adding && (
          <Button
            disabled={loading}
            onClick={() => {
              setAdding(false);
              setPath("");
            }}
          >
            Cancel
          </Button>
        )}
      </Space>
      {adding && (
        <Space.Compact style={{ width: "100%", marginTop: "15px" }}>
          <Input
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
      <ShowError
        style={{ marginTop: "15px" }}
        error={error}
        setError={setError}
      />
    </div>
  );
}
