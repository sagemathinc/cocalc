/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Alert, Checkbox, Spin } from "antd";
import { load_target } from "@cocalc/frontend/history";
import {
  CSS,
  React,
  useActions,
  useEffect,
  useIsMountedRef,
  useMemo,
  useState,
  useTypedRedux,
} from "@cocalc/frontend/app-framework";
import { ErrorDisplay, Title } from "@cocalc/frontend/components";
import { SiteLicensePublicInfoTable } from "@cocalc/frontend/site-licenses/site-license-public-info";
import type { SiteLicenses } from "@cocalc/frontend/site-licenses/types";
import { plural } from "@cocalc/util/misc";

export const LICENSES_STYLE: CSS = {
  margin: "30px 0",
  padding: "0",
} as const;

export const ManagedLicenses: React.FC = () => {
  const [error, setError] = useState<string | undefined>();
  const [loading, setLoading] = useState<boolean>(true);
  const [show_all, set_show_all] = useState<boolean>(false);
  const actions = useActions("billing");
  const is_mounted_ref = useIsMountedRef();

  const active_licenses = useTypedRedux("billing", "managed_license_ids"); // currently or recently valid
  const all_licenses = useTypedRedux("billing", "all_managed_license_ids");
  const licenses = useMemo(
    () => (show_all ? all_licenses : active_licenses),
    [active_licenses, all_licenses, show_all],
  );

  async function reload() {
    setLoading(true);
    try {
      await actions.update_managed_licenses();
    } catch (err) {
      if (!is_mounted_ref.current) return;
      setError(err.toString());
    } finally {
      if (!is_mounted_ref.current) return;
      setLoading(false);
    }
  }

  // When we first mount the component or when error gets cleared,
  // we try to load the managed licenses:
  useEffect(() => {
    if (error) return; // do nothing when error is set.
    reload();
  }, [error]);

  function render_error() {
    if (!error) return;
    return (
      <ErrorDisplay banner error={error} onClose={() => setError(undefined)} />
    );
  }

  function render_managed() {
    if (error) return;
    if (licenses == null) {
      return <Spin />;
    }
    if (licenses.size == 0) {
      return <div>You are not the manager of any licenses yet.</div>;
    }

    const site_licenses: SiteLicenses = licenses.toJS().reduce((acc, v) => {
      acc[v] = null; // we have no info about them yet
      return acc;
    }, {});

    return (
      <div style={LICENSES_STYLE}>
        <SiteLicensePublicInfoTable site_licenses={site_licenses} />
      </div>
    );
  }

  function render_count() {
    if (licenses != null && licenses.size > 0) {
      return <>({licenses.size})</>;
    }
  }

  function render_show_all() {
    if (
      licenses == null ||
      all_licenses == null ||
      active_licenses == null ||
      all_licenses.size == active_licenses.size
    ) {
      // don't show if not loaded or not useful
      return;
    }
    const n = all_licenses.size - licenses.size;
    return (
      <Checkbox
        style={{ marginRight: "15px", fontWeight: 450 }}
        checked={show_all}
        onChange={() => set_show_all(!show_all)}
      >
        {n == 0
          ? "Showing all"
          : `Show all (${n} older expired ${plural(n, "license")} omitted)`}
      </Checkbox>
    );
  }

  return (
    <>
      <Title level={3}>
        Licenses You Manage {render_count()}
        <div style={{ float: "right" }}>{render_show_all()}</div>
        {loading && <Spin />}
      </Title>
      <CancelSubscriptionBanner />
      {render_error()}
      {render_managed()}
    </>
  );
};

// TODO: obviously this should only be shown if the user *has* a subscription!
function CancelSubscriptionBanner() {
  return (
    <Alert
      banner
      type="info"
      message={
        <>
          To cancel a subscription,{" "}
          <a
            onClick={() => {
              load_target("settings/subscriptions");
            }}
          >
            visit the Subscription tab above
          </a>
          . To edit a license <i>that you purchased</i> expand the license
          below, then click on the "Edit License..." button. To apply a license
          to a project, select the project under Projects below.
        </>
      }
    />
  );
}
