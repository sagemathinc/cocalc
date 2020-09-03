/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { React, TypedMap } from "../../app-framework";
import { fromJS } from "immutable";
import { DebounceInput } from "react-debounce-input";
import { Row, Col, Dropdown, Menu } from "antd";
import { actions } from "./actions";
import { plural } from "smc-util/misc2";
import { Icon } from "../../r_misc";
import { INPUT_STYLE } from "./license";
import { presets } from "./upgrade-presets";

import { Quota } from "smc-util/db-schema/site-licenses";
type QuotaMap = TypedMap<Quota>;

interface Props {
  quota: QuotaMap;
}

export const DisplayQuota: React.FC<Props> = React.memo(({ quota }) => {
  return <pre>{JSON.stringify(quota.toJS(), undefined, 2)}</pre>;
});

interface EditProps {
  license_id: string;
  license_field: license_field_names;
  quota: undefined | QuotaMap;
  onChange: Function;
}

export const EditQuota: React.FC<Props> = ({ quota }) => {
  return <pre>{JSON.stringify(quota, undefined, 2)}</pre>;
};

export const EditQuota: React.FC<EditProps> = ({
  license_id,
  license_field,
  quota,
  onChange,
}) => {
  onChange = onChange;
  return (
    <div>
      Editing {license_id} {license_field} {JSON.stringify(quota)}
    </div>
  );
};
