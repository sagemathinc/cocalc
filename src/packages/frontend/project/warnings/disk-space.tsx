/*
 *  This file is part of CoCalc: Copyright © 2020-2026 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Alert } from "antd";
import { join } from "path";
import { useEffect, useRef, useState } from "react";

import {
  useActions,
  useMemo,
  useRedux,
  useTypedRedux,
} from "@cocalc/frontend/app-framework";
import { A } from "@cocalc/frontend/components";
import { appBasePath } from "@cocalc/frontend/customize/app-base-path";
import { COLORS } from "@cocalc/util/theme";

const DISK_INFO_PAGE = "https://doc.cocalc.com/howto/disk-space-warning.html";
const DISMISS_TIME_MS = 3 * 60 * 1000;

export const DiskSpaceWarning: React.FC<{ project_id: string }> = ({
  project_id,
}) => {
  const project = useRedux(["projects", "project_map", project_id]);
  const is_commercial = useTypedRedux("customize", "is_commercial");
  // We got a report of a crash when project isn't defined; that could happen
  // when opening a project via a direct link, and the project isn't in the
  // initial project maps (the map will get extended to all projects, and
  // then this gets rerendered).
  const quotas = useMemo(
    () => (is_commercial ? project?.get("run_quota")?.toJS() : undefined),
    [project, is_commercial],
  );

  const actions = useActions({ project_id });
  const [hideUntil, setHideUntil] = useState<number>(0);
  const dismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // any licenses applied to project? → if yes, edit license; otherwise, purchase new one
  const hasLicenseUpgrades = useMemo(() => {
    const licenses = project?.get("site_license")?.keySeq().toJS() ?? [];
    return licenses.length > 0;
  }, [project?.get("site_license")]);

  const shouldShow = () => {
    if (hideUntil > Date.now()) {
      return false;
    }
    if (
      !is_commercial ||
      project == null ||
      quotas == null ||
      quotas.disk_quota == null
    ) {
      return false;
    }
    const project_status = project.get("status");
    const disk_usage = project_status?.get("disk_MB");
    if (disk_usage == null) return false;
    // it's fine if the usage is below the last 100MB or 90%
    if (
      disk_usage < Math.max(quotas.disk_quota * 0.9, quotas.disk_quota - 100)
    ) {
      return false;
    }
    return true;
  };

  const [open, setOpen] = useState<boolean>(shouldShow());

  useEffect(() => {
    setOpen(shouldShow());
  }, [is_commercial, project, quotas, hideUntil]);

  useEffect(() => {
    return () => {
      if (dismissTimerRef.current != null) {
        clearTimeout(dismissTimerRef.current);
      }
    };
  }, []);

  if (!open || quotas == null) {
    return null;
  }

  const project_status = project?.get("status");
  const disk_usage = project_status?.get("disk_MB") ?? 0;
  const disk_free = Math.max(0, quotas.disk_quota - disk_usage);

  function renderUpgradeLink() {
    if (hasLicenseUpgrades) {
      const url = join(appBasePath, "settings/licenses");
      return (
        <A href={url} style={{ fontWeight: "bold" }}>
          edit your license to increase its disk space quota
        </A>
      );
    } else {
      const url = join(appBasePath, "store/site-license");
      return (
        <A href={url} style={{ fontWeight: "bold" }}>
          purchase a license with more disk space
        </A>
      );
    }
  }

  return (
    <Alert
      closable
      onClose={() => {
        const until = Date.now() + DISMISS_TIME_MS;
        dismissTimerRef.current = setTimeout(() => {
          setHideUntil(0);
          dismissTimerRef.current = null;
        }, DISMISS_TIME_MS);
        setHideUntil(until);
        setOpen(false);
      }}
      type="error"
      style={{ border: "none" }}
      showIcon
      message={
        <b style={{ color: COLORS.GRAY_M }}>
          This project is running out of disk space ({disk_free} MB free of{" "}
          {quotas.disk_quota} MB)
        </b>
      }
      description={
        <div>
          You can {renderUpgradeLink()},{" "}
          <a onClick={() => actions?.set_active_tab("files")}>
            delete some files
          </a>
          , or read about{" "}
          <A href={DISK_INFO_PAGE}>how to deal with low disk space</A>.
        </div>
      }
    />
  );
};
