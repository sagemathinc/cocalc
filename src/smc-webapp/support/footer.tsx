/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { React, useActions, useTypedRedux } from "../app-framework";
import { Button } from "../antd-bootstrap";
import { Modal } from "react-bootstrap";
import { Icon, Space } from "../r_misc";

export const SupportFooter: React.FC = React.memo(() => {
  const status = useTypedRedux("support", "status");
  const valid = useTypedRedux("support", "valid");
  const actions = useActions("support");

  return (
    <Modal.Footer>
      <Button
        tabIndex={5}
        bsStyle="default"
        onClick={() => actions.set_show(false)}
      >
        Close
      </Button>
      <Space />
      {status == "new" && (
        <Button
          bsStyle="primary"
          tabIndex={4}
          onClick={actions.send_support_request}
          disabled={!valid}
        >
          <Icon name="medkit" /> Get support
        </Button>
      )}
    </Modal.Footer>
  );
});

/*
    propTypes : {
        close    : rtypes.func.isRequired,
        submit   : rtypes.func.isRequired,
        show_form: rtypes.bool.isRequired,
        valid    : rtypes.bool.isRequired
    },

    shouldComponentUpdate(props) {
        return misc.is_different(this.props, props, ['show_form', 'valid']);
    },

    render() {
        let btn;
        if (this.props.show_form) {
            btn = <Button bsStyle  = 'primary'
                          tabIndex = {4}
                          onClick  = {this.props.submit}
                          disabled = {!this.props.valid}>
                       <Icon name='medkit' /> Get Support
                   </Button>;
        } else {
            btn = <span/>;
        }

        return <Modal.Footer>
            {btn}
            <Button
                tabIndex  = {5}
                bsStyle   ='default'
                onClick   = {this.props.close}>Close</Button>
        </Modal.Footer>;
    }
});
*/
