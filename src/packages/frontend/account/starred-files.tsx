/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Button } from "antd";
import { useMemo } from "react";
import { FormattedMessage, useIntl } from "react-intl";

import { useCounter } from "@cocalc/frontend/app-framework";
import { Icon, Paragraph } from "@cocalc/frontend/components";
import { labels } from "@cocalc/frontend/i18n";

export function StarredFiles() {
  const intl = useIntl();
  //   const title = intl.formatMessage(labels.starred_files);

  const { val: refresh, inc: doRefresh } = useCounter();

  const data = useMemo(() => {}, [refresh]);

  return (
    <div style={{ marginBottom: "64px" }}>
      <Paragraph>
        <FormattedMessage
          id="account.starred-files.intro"
          defaultMessage={``}
        />
      </Paragraph>
      <Paragraph style={{ textAlign: "right" }}>
        <Button icon={<Icon name="refresh" />} onClick={doRefresh}>
          {intl.formatMessage(labels.refresh)}
        </Button>
      </Paragraph>
      <Paragraph code>{JSON.stringify(data, null, 2)}</Paragraph>
    </div>
  );
}
