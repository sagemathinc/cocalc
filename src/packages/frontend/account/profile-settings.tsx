/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { useIntl } from "react-intl";
import { Panel } from "@cocalc/frontend/antd-bootstrap";
import { Rendered, useTypedRedux } from "@cocalc/frontend/app-framework";
import { ColorPicker } from "@cocalc/frontend/colorpicker";
import { Gap, LabeledRow, Loading } from "@cocalc/frontend/components";
import { labels } from "@cocalc/frontend/i18n";
import { Avatar } from "./avatar/avatar";
import { ProfileImageSelector, setProfile } from "./profile-image";

interface Props {
  email_address?: string;
  // first_name?: string;
  // last_name?: string;
}

export function ProfileSettings({ email_address }: Props) {
  const intl = useIntl();

  // const [show_instructions, set_show_instructions] = useState<boolean>(false);

  const account_id: string = useTypedRedux("account", "account_id");
  const profile = useTypedRedux("account", "profile");

  function onColorChange(value: string) {
    setProfile({
      account_id,
      profile: { color: value },
    });
  }

  function render_header(): Rendered {
    return (
      <>
        <Avatar account_id={account_id} size={48} />
        <Gap />
        <Gap />
        Avatar
      </>
    );
  }

  if (account_id == null || profile == null) {
    return <Loading />;
  }

  return (
    <Panel header={render_header()}>
      <LabeledRow label={intl.formatMessage(labels.color)}>
        <ColorPicker
          color={profile?.get("color")}
          justifyContent={"flex-start"}
          onChange={onColorChange}
        />
      </LabeledRow>
      <LabeledRow label="Style">
        <ProfileImageSelector
          account_id={account_id}
          email_address={email_address}
          profile={profile}
        />
      </LabeledRow>
    </Panel>
  );
}
