/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { FormattedMessage, useIntl } from "react-intl";

import ApiKeysTables from "@cocalc/frontend/components/api-keys";
import { webapp_client } from "@cocalc/frontend/webapp-client";
import { Paragraph, SettingBox } from "@cocalc/frontend/components";

const manage = (opts) => webapp_client.account_client.api_keys(opts);

export default function ApiKeys() {
  const intl = useIntl();

  const title = intl.formatMessage({
    id: "account.settings.api-keys.title",
    defaultMessage: "API Keys",
  });

  return (
    <SettingBox title={title} icon={"api"}>
      <ApiKeysTables manage={manage} />
      <Paragraph>
        <FormattedMessage
          id="account.settings.api-keys.explanation"
          defaultMessage={`You can also make project specific api keys in any project's settings.
          If you only need to use the API to access one project, these are safer.`}
        />
      </Paragraph>
    </SettingBox>
  );
}
