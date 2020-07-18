import { ErrorDisplay, Loading } from "../../r_misc";
import { React, useState, useAsyncEffect } from "../../app-framework";
import { getManagedLicenses } from "./util";

import { LicenseYouManage } from "./license-you-manage";

export const ManagedLicenses: React.FC = () => {
  const [licenses, setLicenses] = useState<string[] | undefined>(undefined);
  const [error, setError] = useState<string | undefined>(undefined);

  // When we first mount the component or when error gets cleared,
  // we try to load the managed licenses:
  useAsyncEffect(
    async (is_mounted) => {
      if (error) return; // do nothing when error is set.
      try {
        const v = await getManagedLicenses();
        if (!is_mounted()) return;
        setLicenses(v);
      } catch (err) {
        if (!is_mounted()) return;
        setError(err.toString());
      }
    },
    [error]
  );

  function render_error() {
    if (!error) return;
    return <ErrorDisplay error={error} onClose={() => setError(undefined)} />;
  }

  function render_managed() {
    if (error) return;
    if (licenses == null) {
      return <Loading theme={"medium"} />;
    }
    if (licenses.length == 0) {
      return <div>You do not manage any licenses.</div>;
    }
    return licenses.map((license_id) => (
      <LicenseYouManage license_id={license_id} key={license_id} />
    ));
  }

  return (
    <div>
      <h3>Licenses that you manage</h3>
      {render_error()}
      {render_managed()}
    </div>
  );
};
