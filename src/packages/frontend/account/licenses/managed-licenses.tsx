/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { Button, Checkbox } from "antd";
import { ErrorDisplay, Icon, Loading, Space } from "../../components";
import {
  CSS,
  React,
  useActions,
  useEffect,
  useMemo,
  useState,
  useTypedRedux,
  useIsMountedRef,
} from "../../app-framework";

import {
  SiteLicensePublicInfoTable,
  SiteLicenses,
} from "../../site-licenses/site-license-public-info";

export const LICENSES_STYLE: CSS = {
  margin: "30px 0",
  padding: "0",
} as const;

export const ManagedLicenses: React.FC = () => {
  const [error, setError] = useState<string | undefined>(undefined);
  const [loading, setLoading] = useState<boolean>(true);
  const [show_all, set_show_all] = useState<boolean>(false);
  const actions = useActions("billing");
  const is_mounted_ref = useIsMountedRef();

  const active_licenses = useTypedRedux("billing", "managed_license_ids"); // currently or recently valid
  const all_licenses = useTypedRedux("billing", "all_managed_license_ids");
  const licenses = useMemo(
    () => (show_all ? all_licenses : active_licenses),
    [active_licenses, all_licenses, show_all]
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
    return <ErrorDisplay error={error} onClose={() => setError(undefined)} />;
  }

  function render_managed() {
    if (error) return;
    if (licenses == null) {
      return <Loading theme={"medium"} />;
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
        {n == 0 ? "Showing all" : `Show all (${n} expired licenses omitted)`}
      </Checkbox>
    );
  }

  return (
    <div>
      <h3>
        Licenses that you manage {render_count()}
        <div style={{ float: "right" }}>
          {render_show_all()}
          <Button onClick={reload} disabled={loading}>
            <Icon name="redo" />
            <Space /> <Space /> {loading ? "Loading..." : "Refresh all"}
          </Button>
        </div>
      </h3>
      {render_error()}
      {render_managed()}
    </div>
  );
};
