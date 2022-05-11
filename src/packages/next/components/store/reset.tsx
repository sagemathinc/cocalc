/*
 *  This file is part of CoCalc: Copyright © 2022 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { Button, Form, Popconfirm } from "antd";

export function Reset({ addBox, router, form, onChange }) {
  return (
    <Form.Item wrapperCol={{ offset: 0, span: 24 }}>
      {addBox}
      {router.query.id == null && (
        <Popconfirm
          title="Reset all values to their default?"
          onConfirm={() => {
            form.resetFields();
            onChange();
          }}
        >
          <Button style={{ float: "right" }}>Reset Form</Button>
        </Popconfirm>
      )}
    </Form.Item>
  );
}
