import { Button } from "antd";
import { useIntl } from "react-intl";

import { Icon } from "@cocalc/frontend/components/icon";
import { labels } from "@cocalc/frontend/i18n";

export default function Refresh({
  handleRefresh,
  disabled,
  style,
}: {
  handleRefresh;
  disabled?: boolean;
  style?;
}) {
  const intl = useIntl();

  return (
    <Button
      type="text"
      onClick={handleRefresh}
      disabled={disabled}
      style={style}
    >
      <Icon name="refresh" />
      {intl.formatMessage(labels.refresh)}
    </Button>
  );
}
