/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { React, useTypedRedux } from "../app-framework";
import { A } from "../r_misc";

export const TermsOfService: React.FC<{ style?: React.CSSProperties }> = ({
  style,
}) => {
  const terms_of_service = useTypedRedux("customize", "terms_of_service");
  const terms_of_service_url = useTypedRedux("customize", "terms_of_service_url");
  if (terms_of_service?.length > 0) {
    return (
      <div
        style={style}
        dangerouslySetInnerHTML={{ __html: terms_of_service }}
      ></div>
    );
  } else if (terms_of_service_url?.length > 0) {
    // only used in the context of signing up, hence that phrase...
    return (
      <div style={style}>
        I agree to the <A href={terms_of_service_url}>Terms of Service</A>.
      </div>
    );
  } else {
    return <></>;
  }
};
