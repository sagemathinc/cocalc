/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { FormattedMessage } from "react-intl";

import { Alert } from "@cocalc/frontend/antd-bootstrap";
import { Icon } from "@cocalc/frontend/components";

// A warning to put on pages when the project is deleted
export const DeletedProjectWarning: React.FC = () => {
  return (
    <Alert bsStyle="danger" banner style={{ width: "100%" }}>
      <FormattedMessage
        id="project.warnings.deleted.banner"
        defaultMessage={`<h4>{icon} Warning: this project is <strong>deleted!</strong></h4>
        If you intend to use this project, you should <strong>undelete it</strong> in project settings.`}
        values={{
          icon: <Icon name="exclamation-triangle" />,
          strong: (c) => <strong>{c}</strong>,
          h4: (c) => <h4>{c}</h4>,
        }}
      />
    </Alert>
  );
};
