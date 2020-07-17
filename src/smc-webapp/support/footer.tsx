/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
import { React, useRedux } from "../app-framework";
import { Button, Modal } from "../antd-bootstrap";
import { Icon } from "../r_misc";

export const SupportFooter: React.FC = React.memo(() => {
  let btn;
  if (this.props.show_form) {
    btn = (
      <Button
        bsStyle="primary"
        tabIndex={4}
        onClick={this.props.submit}
        disabled={!this.props.valid}
      >
        <Icon name="medkit" /> Get Support
      </Button>
    );
  } else {
    btn = <span />;
  }

  return (
    <Modal.Footer>
      {btn}
      <Button tabIndex={5} bsStyle="default" onClick={this.props.close}>
        Close
      </Button>
    </Modal.Footer>
  );
});
*/
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
