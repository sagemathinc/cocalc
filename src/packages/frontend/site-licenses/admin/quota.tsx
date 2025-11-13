/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */
import { React, TypedMap } from "@cocalc/frontend/app-framework";
import { SiteLicenseQuota } from "@cocalc/util/types/site-licenses";
import { fromJS } from "immutable";
import { QuotaEditor } from "../purchase/quota-editor";
import { actions } from "./actions";
import { license_field_names } from "./types";
type QuotaMap = TypedMap<SiteLicenseQuota>;

interface Props {
  quota?: QuotaMap;
}

export const DisplayQuota: React.FC<Props> = React.memo(({ quota }) => {
  return <pre>{JSON.stringify(quota?.toJS(), undefined, 2)}</pre>;
});

interface EditProps {
  license_id: string;
  license_field: license_field_names;
  quota: undefined | QuotaMap;
}

export const EditQuota: React.FC<EditProps> = ({
  license_id,
  license_field,
  quota,
}) => {
  const q = quota?.toJS() ?? {};
  return (
    <QuotaEditor
      hideExtra={true}
      adminMode={true}
      quota={q}
      show_advanced_default={true}
      onChange={(change) => {
        const new_quota = fromJS({ ...q, ...change });
        actions.set_edit(license_id, license_field, new_quota);
      }}
    />
  );
};
