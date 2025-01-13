import { Button, Space, Tooltip } from "antd";
import { useIntl } from "react-intl";

import { useActions, useTypedRedux } from "@cocalc/frontend/app-framework";
import { Icon } from "@cocalc/frontend/components/icon";
import { labels } from "@cocalc/frontend/i18n";

export default function Zoom({ style }: { style? }) {
  const intl = useIntl();
  const actions = useActions("messages");
  const fontSize = useTypedRedux("messages", "fontSize");

  return (
    <Space.Compact style={style}>
      <Tooltip title={intl.formatMessage(labels.decrease_font_size)}>
        <Button
          type="text"
          onClick={() => {
            actions.setFontSize(fontSize - 1);
          }}
        >
          <Icon name="minus" />
        </Button>
      </Tooltip>
      <Tooltip title={intl.formatMessage(labels.increase_font_size)}>
        <Button
          type="text"
          onClick={() => {
            actions.setFontSize(fontSize + 1);
          }}
        >
          <Icon name="plus" />
        </Button>
      </Tooltip>
    </Space.Compact>
  );
}
