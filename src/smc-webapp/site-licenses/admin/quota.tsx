/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */
import { fromJS } from "immutable";
import { React, TypedMap } from "../../app-framework";
import { Quota } from "smc-util/db-schema/site-licenses";
import { license_field_names } from "./types";
import { actions } from "./actions";
import { QuotaEditor } from "../purchase/quota-editor";
type QuotaMap = TypedMap<Quota>;

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
  const q = quota?.toJS() ?? { member: true };
  return (
    <QuotaEditor
      hideExtra={true}
      quota={q}
      show_advanced_default={true}
      onChange={(change) => {
        const new_quota = fromJS({ ...q, ...change });
        actions.set_edit(license_id, license_field, new_quota);
      }}
    />
  );
};
