/*
 *  This file is part of CoCalc: Copyright © 2022 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Button, Modal, Space } from "antd";
import { join } from "path";
import { FormattedMessage, useIntl } from "react-intl";

import { useState } from "@cocalc/frontend/app-framework";
import { getNow } from "@cocalc/frontend/app/util";
import { A, Icon, Paragraph } from "@cocalc/frontend/components";
import { useStudentProjectFunctionality } from "@cocalc/frontend/course";
import { appBasePath } from "@cocalc/frontend/customize/app-base-path";
import { labels } from "@cocalc/frontend/i18n";
import * as LS from "@cocalc/frontend/misc/local-storage-typed";
import { trunc } from "@cocalc/util/misc";
import { useProjectContext } from "./context";

const MEMBERSHIP_URL = join(appBasePath, "/settings");

const INET_QUOTA_URL = "https://doc.cocalc.com/upgrades.html#internet-access";

interface NoInternetBannerProps {
  projectSiteLicenses: string[];
  isPaidStudentPayProject?: boolean;
  hasComputeServers: boolean;
}

export function useInternetWarningClosed(
  project_id: string,
): [boolean, () => void] {
  function key(project_id: string): string {
    return `internet-warning-dismissed-${project_id}`;
  }

  // if the user closes the modal, they don't see it again for a day.
  const dismissedTS = LS.get<number>(key(project_id));
  const now = getNow();
  const oneDay = 1 * 24 * 60 * 60 * 1000;
  const alreadyDismissed =
    typeof dismissedTS === "number" && now < dismissedTS + oneDay;

  const [dismissed, setDismissed] = useState<boolean>(alreadyDismissed);

  function dismiss() {
    setDismissed(true);
    const now = getNow();
    LS.set(key(project_id), now);
  }

  return [dismissed, dismiss];
}

export function NoInternetModal(props: NoInternetBannerProps) {
  const { isPaidStudentPayProject, hasComputeServers } = props;
  const { project_id, project } = useProjectContext();
  const intl = useIntl();
  const projectLabelLower = intl.formatMessage(labels.project).toLowerCase();
  const student_project_functionality =
    useStudentProjectFunctionality(project_id);

  const [dismissed, dismissInternetWarning] =
    useInternetWarningClosed(project_id);

  // CRITICAL: Do NOT show a message with a link to upgrade to students,
  // since that causes massive confusion with normal student pay, as they end
  // up buying the wrong thing.
  function renderMessage() {
    return (
      <>
        <Paragraph>
          <FormattedMessage
            id="project.no-internet-modal.info"
            defaultMessage={`<strong>Internet access is disabled for this {projectLabel}.</strong>
            This restriction prevents installing Python packages (pip, conda) or R packages,
            using Git to clone repositories, downloading datasets or accessing APIs.
            Commands that attempt to access the internet may hang or fail to complete,
            as network connections are blocked to prevent abuse. <A>Learn more</A>.`}
            values={{
              strong: (c) => <strong>{c}</strong>,
              A: (c) => <A href={INET_QUOTA_URL}>{c}</A>,
              projectLabel: projectLabelLower,
            }}
          />
        </Paragraph>
        {hasComputeServers && (
          <Paragraph>
            NOTE: Compute servers always have internet access.
          </Paragraph>
        )}
        {!isPaidStudentPayProject && (
          <Paragraph>
            <FormattedMessage
              id="project.no-internet-modal.message"
              defaultMessage={`To fix this, upgrade your <A1>membership</A1>.`}
              values={{
                A1: (c) => <A href={MEMBERSHIP_URL}>{c}</A>,
              }}
            />
          </Paragraph>
        )}
      </>
    );
  }

  if (dismissed || student_project_functionality.disableNetworkWarningBanner) {
    return null;
  }

  return (
    <Modal
      open={true}
      width={800}
      onCancel={() => dismissInternetWarning()}
      footer={
        <Space>
          <Button onClick={() => dismissInternetWarning()} type="primary">
            {intl.formatMessage(labels.dismiss)}
          </Button>
        </Space>
      }
      title={
        <>
          <Icon name="exclamation-triangle" />{" "}
          {intl.formatMessage(
            {
              id: "project.no-internet-modal.title",
              defaultMessage: '{projectLabel} "{name}" has no internet access',
            },
            {
              projectLabel: intl.formatMessage(labels.project),
              name: trunc(project?.get("title") ?? project_id, 30),
            },
          )}
        </>
      }
    >
      {renderMessage()}
    </Modal>
  );
}
