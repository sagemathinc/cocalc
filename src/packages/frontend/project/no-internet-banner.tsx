/*
 *  This file is part of CoCalc: Copyright © 2022 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Alert, Button } from "antd";
import { join } from "path";
import { useStudentProjectFunctionality } from "@cocalc/frontend/course";
import {
  CSS,
  React,
  useActions,
  useState,
  useTypedRedux,
} from "@cocalc/frontend/app-framework";
import { A, Icon, Text, VisibleMDLG } from "@cocalc/frontend/components";
import { appBasePath } from "@cocalc/frontend/customize/app-base-path";
import {
  ALERT_STYLE,
  BannerApplySiteLicense,
  NO_INTERNET,
} from "./trial-banner";
import { BUY_A_LICENSE_URL } from "./call-to-support";

const MANAGE_LICENSE_URL = join(appBasePath, "/licenses/managed");

interface NoInternetBannerProps {
  project_id: string;
  projectSiteLicenses: string[];
  isPaidStudentPayProject?: boolean;
}

const STYLE: CSS = {
  ...ALERT_STYLE,
  fontSize: "12pt",
} as const;

export const NoInternetBanner: React.FC<NoInternetBannerProps> = React.memo(
  (props: NoInternetBannerProps) => {
    const { project_id, projectSiteLicenses, isPaidStudentPayProject } = props;
    const student_project_functionality =
      useStudentProjectFunctionality(project_id);

    const actions = useActions({ project_id });

    const [showAddLicense, setShowAddLicense] = useState<boolean>(false);

    const internet_warning_closed = useTypedRedux(
      { project_id },
      "internet_warning_closed",
    );

    // CRITICAL: Do NOT show a message with a link to upgrade to students,
    // since that causes massive confusion with normal student pay, as they end
    // up buying the wrong thing.
    function renderMessage() {
      return (
        <>
          <strong>No internet access</strong> – {NO_INTERNET}.
          {!isPaidStudentPayProject && (
            <>
              {" "}
              You <a onClick={() => setShowAddLicense(true)}>
                need to apply
              </a> a <A href={MANAGE_LICENSE_URL}>valid license</A> providing
              upgrades or <A href={BUY_A_LICENSE_URL}>purchase one</A>.
            </>
          )}
        </>
      );
    }

    function renderDescription(): React.JSX.Element {
      return (
        <div style={{ display: "flex", flexDirection: "row" }}>
          <div style={{ flex: "1 1 auto" }}>
            <Text style={{ fontSize: ALERT_STYLE.fontSize }}>
              {renderMessage()}
            </Text>
          </div>
          <div>
            <Button
              size="small"
              type="default"
              icon={<Icon name="times-circle" />}
              onClick={() => actions?.close_project_no_internet_warning()}
            >
              Dismiss
            </Button>
          </div>
        </div>
      );
    }

    if (
      internet_warning_closed ||
      student_project_functionality.disableNetworkWarningBanner
    ) {
      return null;
    }

    return (
      <VisibleMDLG>
        <Alert
          type="warning"
          banner={true}
          style={STYLE}
          icon={<Icon name="exclamation-triangle" />}
          description={
            <>
              {renderDescription()}
              {showAddLicense && (
                <BannerApplySiteLicense
                  project_id={project_id}
                  projectSiteLicenses={projectSiteLicenses}
                  setShowAddLicense={setShowAddLicense}
                />
              )}
            </>
          }
        />
      </VisibleMDLG>
    );
  },
);
