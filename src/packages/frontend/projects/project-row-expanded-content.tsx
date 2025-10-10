/*
 *  This file is part of CoCalc: Copyright © 2025 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/**
 * Expanded row content for the Projects Table
 *
 * Shows additional project details when a row is expanded:
 * - Collaborators
 * - Project ID (copyable)
 * - Software image
 * - Project state
 * - Action buttons
 */

import { Button, Descriptions, Space } from "antd";
import { useState } from "react";
import { useIntl } from "react-intl";

import {
  useActions,
  useRedux,
  useTypedRedux,
} from "@cocalc/frontend/app-framework";
import { AddCollaborators } from "@cocalc/frontend/collaborators";
import {
  CopyToClipBoard,
  Icon,
  ProjectState,
} from "@cocalc/frontend/components";
import {
  compute_image2basename,
  is_custom_image,
} from "@cocalc/frontend/custom-software/util";
import { labels } from "@cocalc/frontend/i18n";
import { DEFAULT_COMPUTE_IMAGE } from "@cocalc/util/db-schema";
import { KUCALC_COCALC_COM } from "@cocalc/util/db-schema/site-defaults";
import { COLORS } from "@cocalc/util/theme";

import { ProjectUsers } from "./project-users";

interface Props {
  project_id: string;
  onClose?: () => void;
}

export function ProjectRowExpandedContent({ project_id, onClose }: Props) {
  const [show_add_collab, set_show_add_collab] = useState<boolean>(false);
  const intl = useIntl();

  const actions = useActions("projects");
  const project = useRedux(["projects", "project_map", project_id]);
  const images = useTypedRedux("compute_images", "images");
  const kucalc = useTypedRedux("customize", "kucalc");
  const software = useTypedRedux("customize", "software");
  const is_anonymous = useTypedRedux("account", "is_anonymous");

  if (!project) {
    return null;
  }

  function openProjectSettings() {
    actions.open_project({
      project_id,
      switch_to: true,
      target: "settings",
    });
  }

  function renderSoftwareImage() {
    const ci = project.get("compute_image");
    if (ci == null || images == null) return "Default";

    if (is_custom_image(ci)) {
      const id = compute_image2basename(ci);
      const img = images.get(id);
      if (img == null) return ci;
      const name = img.get("display");
      return (
        <span>
          {name}{" "}
          <span
            style={{ color: COLORS.GRAY }}
            title="Custom image created by a third party"
          >
            (custom)
          </span>
        </span>
      );
    } else {
      if (ci === DEFAULT_COMPUTE_IMAGE) return "Default";
      const name = software?.getIn(["environments", ci, "title"]) ?? ci;
      const descr = software?.getIn(["environments", ci, "descr"]) ?? "";
      return (
        <span title={descr}>
          {name}
          {kucalc === KUCALC_COCALC_COM && (
            <span
              style={{ color: COLORS.GRAY, marginLeft: "4px" }}
              title="Official image created by CoCalc"
            >
              (official)
            </span>
          )}
        </span>
      );
    }
  }

  function renderCollaborators() {
    if (is_anonymous) return null;

    return (
      <div>
        <div style={{ marginBottom: "8px" }}>
          <ProjectUsers
            project={project}
            none={<span>No collaborators</span>}
          />
        </div>
        {show_add_collab ? (
          <AddCollaborators
            project_id={project_id}
            autoFocus
            where="projects-table-expanded"
          />
        ) : (
          <Button
            size="small"
            onClick={() => set_show_add_collab(true)}
            icon={<Icon name="user-plus" />}
          >
            Add Collaborator
          </Button>
        )}
      </div>
    );
  }

  return (
    <div
      style={{
        margin: 0,
        padding: "10px 20px",
        backgroundColor: COLORS.GRAY_LLL,
      }}
    >
      <div style={{ marginBottom: "10px", textAlign: "right" }}>
        <Space>
          <Button
            type="text"
            size="small"
            onClick={openProjectSettings}
            icon={<Icon name="settings" />}
          >
            {intl.formatMessage({
              id: "projects.row.expanded.open_settings",
              defaultMessage: "Open Settings",
            })}
          </Button>
          {onClose && (
            <Button
              type="text"
              size="small"
              onClick={onClose}
              icon={<Icon name="times-circle" />}
            >
              {intl.formatMessage(labels.close)}
            </Button>
          )}
        </Space>
      </div>

      <Descriptions column={2} size="small" bordered style={{ margin: 0 }}>
        {!is_anonymous && (
          <Descriptions.Item label={intl.formatMessage(labels.collaborators)} span={2}>
            {renderCollaborators()}
          </Descriptions.Item>
        )}
        <Descriptions.Item label="Project ID">
          <CopyToClipBoard
            value={project_id}
            inputStyle={{ fontSize: "11px" }}
          />
        </Descriptions.Item>
        <Descriptions.Item label="State">
          <ProjectState state={project.get("state")} />
        </Descriptions.Item>
        <Descriptions.Item label="Software Image" span={2}>
          {renderSoftwareImage()}
        </Descriptions.Item>
      </Descriptions>
    </div>
  );
}
