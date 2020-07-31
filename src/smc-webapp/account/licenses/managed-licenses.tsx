import { ErrorDisplay, Loading } from "../../r_misc";
import {
  React,
  useState,
  useActions,
  useAsyncEffect,
  useTypedRedux,
} from "../../app-framework";

import { LicenseYouManage } from "./license-you-manage";

export const ManagedLicenses: React.FC = () => {
  const [error, setError] = useState<string | undefined>(undefined);
  const licenses = useTypedRedux("billing", "managed_licenses");
  const actions = useActions("billing");

  // When we first mount the component or when error gets cleared,
  // we try to load the managed licenses:
  useAsyncEffect(
    async (is_mounted) => {
      if (error) return; // do nothing when error is set.
      try {
        await actions.update_managed_licenses();
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
      <h3>Licenses that you manage</h3>
      {render_error()}
      {render_managed()}
    </div>
  );
};
