/*
 *  This file is part of CoCalc: Copyright © 2022 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { Alert, Button } from "antd";
import { join } from "path";

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
  A_STYLE,
  BannerApplySiteLicense,
  BUY_A_LICENSE_URL,
  NO_INTERNET,
} from "./trial-banner";

const MANAGE_LICENSE_URL = join(appBasePath, "/licenses/managed");

interface NoInternetBannerProps {
  project_id: string;
  projectSiteLicenses: string[];
}

const STYLE: CSS = {
  ...ALERT_STYLE,
  fontSize: "12pt",
} as const;

export const NoInternetBanner: React.FC<NoInternetBannerProps> = React.memo(
  (props: NoInternetBannerProps) => {
    const { project_id, projectSiteLicenses } = props;

    const actions = useActions({ project_id });

    const [showAddLicense, setShowAddLicense] = useState<boolean>(false);

    const internet_warning_closed = useTypedRedux(
      { project_id },
      "internet_warning_closed"
    );

    function renderMessage() {
      return (
        <>
          <strong>No internet access</strong> – Inside this project{" "}
          {NO_INTERNET}. You{" "}
          <a style={A_STYLE} onClick={() => setShowAddLicense(true)}>
            need to apply
          </a>{" "}
          a <A href={MANAGE_LICENSE_URL}>valid license</A> providing upgrades or{" "}
          <A href={BUY_A_LICENSE_URL}>purchase one</A>!
        </>
      );
    }

    function renderDescription(): JSX.Element {
      return (
        <div style={{ display: "flex", flexDirection: "row" }}>
          <div style={{ flex: "1 1 auto", marginTop: "4px" }}>
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

    if (internet_warning_closed) {
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
  }
);
