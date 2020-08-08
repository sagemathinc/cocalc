/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { Button } from "antd";
import { ErrorDisplay, Icon, Loading, Space } from "../../r_misc";
import {
  CSS,
  React,
  useActions,
  useEffect,
  useState,
  useTypedRedux,
  useIsMountedRef,
} from "../../app-framework";

import { LicenseYouManage } from "./license-you-manage";

export const LICENSES_STYLE: CSS = {
  margin: "15px 30px",
  maxHeight: "70vh",
  overflowY: "auto",
  border: "1px solid #ccc",
  padding: "5px",
  borderRadius: "3px",
} as const;

export const ManagedLicenses: React.FC = () => {
  const [error, setError] = useState<string | undefined>(undefined);
  const [loading, setLoading] = useState<boolean>(false);
  const licenses = useTypedRedux("billing", "managed_license_ids");
  const actions = useActions("billing");
  const is_mounted_ref = useIsMountedRef();

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
      return <div>You do not manage any licenses.</div>;
    }
    return licenses
      .toJS()
      .map((license_id) => (
        <LicenseYouManage license_id={license_id} key={license_id} />
      ));
  }

  return (
    <div>
      <h3>
        Licenses that you manage{" "}
        <Button onClick={reload} disabled={loading} style={{ float: "right" }}>
          <Icon name="redo" />
          <Space /> {loading ? "Loading..." : "Refresh all"}
        </Button>
      </h3>
      {render_error()}
      <div style={LICENSES_STYLE}>{render_managed()}</div>
    </div>
  );
};
