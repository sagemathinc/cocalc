/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Map } from "immutable";

import { Panel } from "@cocalc/frontend/antd-bootstrap";
import {
  Component,
  Rendered,
  rclass,
  rtypes,
} from "@cocalc/frontend/app-framework";
import { ColorPicker } from "@cocalc/frontend/colorpicker";
import { Gap, LabeledRow, Loading } from "@cocalc/frontend/components";
import { Avatar } from "./avatar/avatar";
import { ProfileImageSelector, setProfile } from "./profile-image";

interface Props {
  email_address?: string;
  first_name?: string;
  last_name?: string;

  // redux props
  account_id: string;
  profile: Map<string, any>;
}

interface State {
  show_instructions: boolean;
}

class ProfileSettings extends Component<Props, State> {
  constructor(props, state) {
    super(props, state);
    this.state = { show_instructions: false };
  }

  static reduxProps() {
    return {
      account: {
        account_id: rtypes.string,
        profile: rtypes.immutable.Map,
      },
    };
  }

  private onColorChange = (value: string) => {
    setProfile({
      account_id: this.props.account_id,
      profile: { color: value },
    });
  };

  private render_header(): Rendered {
    return (
      <>
        <Avatar account_id={this.props.account_id} size={48} />
        <Gap />
        <Gap />
        Avatar
      </>
    );
  }

  public render(): JSX.Element {
    if (this.props.account_id == null || this.props.profile == null) {
      return <Loading />;
    }
    return (
      <Panel header={this.render_header()}>
        <LabeledRow label="Color">
          <ColorPicker
            color={this.props.profile?.get("color")}
            justifyContent={"flex-start"}
            onChange={this.onColorChange}
          />
        </LabeledRow>
        <LabeledRow label="Style">
          <ProfileImageSelector
            account_id={this.props.account_id}
            email_address={this.props.email_address}
            profile={this.props.profile}
          />
        </LabeledRow>
      </Panel>
    );
  }
}

const tmp = rclass(ProfileSettings);
export { tmp as ProfileSettings };
