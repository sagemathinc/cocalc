/*
 *  This file is part of CoCalc: Copyright © 2022 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Button, Modal, Space } from "antd";
import { join } from "path";
import { defineMessage, FormattedMessage, useIntl } from "react-intl";

import { useState } from "@cocalc/frontend/app-framework";
import { getNow } from "@cocalc/frontend/app/util";
import { A, Icon, Paragraph } from "@cocalc/frontend/components";
import { useStudentProjectFunctionality } from "@cocalc/frontend/course";
import { appBasePath } from "@cocalc/frontend/customize/app-base-path";
import { labels } from "@cocalc/frontend/i18n";
import * as LS from "@cocalc/frontend/misc/local-storage-typed";
import { BUY_A_LICENSE_URL } from "./call-to-support";
import { BannerApplySiteLicense } from "./trial-banner";

const MANAGE_LICENSE_URL = join(appBasePath, "/licenses/managed");

const INET_QUOTA_URL = "https://doc.cocalc.com/upgrades.html#internet-access";

const NO_INTERNET_ACCESS = defineMessage({
  id: "project.no-internet-modal.title",
  defaultMessage: "No Internet Access",
});

interface NoInternetBannerProps {
  project_id: string;
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
  const {
    project_id,
    projectSiteLicenses,
    isPaidStudentPayProject,
    hasComputeServers,
  } = props;
  const intl = useIntl();
  const student_project_functionality =
    useStudentProjectFunctionality(project_id);

  const [showAddLicense, setShowAddLicense] = useState<boolean>(false);

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
            defaultMessage={`<strong>Internet access is disabled for this project.</strong>
            This restriction prevents installing Python packages (pip, conda) or R packages,
            using Git to clone repositories, downloading datasets or accessing APIs.
            Commands that attempt to access the internet may hang or fail to complete,
            as network connections are blocked to prevent abuse. <A>Learn more</A>.`}
            values={{
              strong: (c) => <strong>{c}</strong>,
              A: (c) => <A href={INET_QUOTA_URL}>{c}</A>,
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
              defaultMessage={`To fix this, you <A1>need to apply</A1> a <A2>valid license</A2> providing upgrades or <A3>purchase a license</A3>.`}
              values={{
                A1: (c) => <a onClick={() => setShowAddLicense(true)}>{c}</a>,
                A2: (c) => <A href={MANAGE_LICENSE_URL}>{c}</A>,
                A3: (c) => <A href={BUY_A_LICENSE_URL}>{c}</A>,
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
      width={showAddLicense ? 800 : undefined}
      onCancel={() => dismissInternetWarning()}
      footer={
        <Space>
          {!showAddLicense && (
            <Button onClick={() => setShowAddLicense(true)}>
              {intl.formatMessage({
                id: "project.no-internet-modal.add-license",
                defaultMessage: "Add License",
              })}
            </Button>
          )}
          <Button onClick={() => dismissInternetWarning()} type="primary">
            {intl.formatMessage(labels.dismiss)}
          </Button>
        </Space>
      }
      title={
        <>
          <Icon name="exclamation-triangle" />{" "}
          {intl.formatMessage(NO_INTERNET_ACCESS)}
        </>
      }
    >
      {renderMessage()}
      <Paragraph>
        {showAddLicense && (
          <BannerApplySiteLicense
            project_id={project_id}
            projectSiteLicenses={projectSiteLicenses}
            setShowAddLicense={setShowAddLicense}
            narrow={true}
            licenseAdded={() =>
              // when a license is added, we close the modal
              dismissInternetWarning()
            }
          />
        )}
      </Paragraph>
    </Modal>
  );
}
