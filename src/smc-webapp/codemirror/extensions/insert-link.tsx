/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import * as CodeMirror from "codemirror";
import { Button, Checkbox, Form, Input, Modal } from "antd";
import { React } from "../../app-framework";
import { show_react_modal } from "../../misc-page";
import { Icon } from "../../r_misc";
import { alert_message } from "../../alerts";

export interface Options {
  url: string;
  displayed_text: string;
  target: boolean; // if true, opens in a new window
  title: string;
}

function insert_link(mode: string, opts: Options): string {
  for (const k in opts) {
    if (typeof opts[k] == "string") {
      opts[k] = opts[k].trim();
    }
  }
  let { url, displayed_text, target, title } = opts;
  let s: string = "";
  if (mode === "md") {
    // [Python](http://www.python.org/ "the python website")
    if (title.length > 0) {
      title = ` \"${title}\"`;
    }
    if (displayed_text.length > 0) {
      s = `[${displayed_text}](${url}${title})`;
    } else {
      s = url;
    }
  } else if (mode === "rst") {
    // `Python <http://www.python.org/#target>`_
    if (displayed_text.length == 0) {
      displayed_text = url;
    }
    s = `\`${displayed_text} <${url}>\`_`;
  } else if (mode === "tex") {
    // \url{http://www.wikibooks.org}
    // \href{http://www.wikibooks.org}{Wikibooks home}
    url = url.replace(/#/g, "\\#"); // should end up as \#
    url = url.replace(/&/g, "\\&"); // ... \&
    url = url.replace(/_/g, "\\_"); // ... \_
    if (displayed_text.length > 0) {
      s = `\\href{${url}}{${displayed_text}}`;
    } else {
      s = `\\url{${url}}`;
    }
  } else if (mode === "mediawiki") {
    // https://www.mediawiki.org/wiki/Help:Links
    // [http://mediawiki.org MediaWiki]
    if (displayed_text.length > 0) {
      displayed_text = ` ${displayed_text}`;
    }
    s = `[${url}${displayed_text}]`;
  } else {
    // if (mode == "html") ## HTML default fallback
    const target1 = target ? " target='_blank' rel='noopener'" : "";

    if (title.length > 0) {
      title = ` title='${title}'`;
    }

    if (displayed_text.length == 0) {
      displayed_text = url;
    }
    s = `<a href='${url}'${title}${target1}>${displayed_text}</a>`;
  }
  return s;
}

export async function get_insert_link_opts_from_user(
  default_display: string,
  show_target: boolean
): Promise<undefined | Options> {
  return await show_react_modal((cb) => {
    return (
      <Modal
        title={
          <h3>
            <Icon name="link" /> Insert Link
          </h3>
        }
        visible={true}
        footer={<Button onClick={() => cb()}>Cancel</Button>}
        onCancel={() => cb()}
      >
        <Form
          labelCol={{ span: 8 }}
          wrapperCol={{ span: 16 }}
          name="options"
          initialValues={{
            url: "",
            displayed_text: default_display,
            target: false,
            title: "",
          }}
          onFinish={(values) => {
            // empty displayed text really doesn't work well (since can't see the link).
            if (!values.displayed_text) values.displayed_text = values.title;
            if (!values.displayed_text) values.displayed_text = values.url;
            if (!values.displayed_text) values.displayed_text = "link";
            cb(undefined, values);
          }}
          onFinishFailed={(err) => cb(err)}
        >
          <Form.Item
            label="URL"
            name="url"
            rules={[
              {
                required: true,
                message: "You must enter the URL of the link.",
              },
            ]}
          >
            <Input placeholder="URL..." />
          </Form.Item>
          <Form.Item label="Displayed text" name="displayed_text">
            <Input placeholder="Displayed text..." />
          </Form.Item>
          <Form.Item label="Title" name="title">
            <Input placeholder="Title..." />
          </Form.Item>
          {show_target && (
            <Form.Item label="Target" name="target" valuePropName="checked">
              <Checkbox>Open in new window</Checkbox>
            </Form.Item>
          )}
          <Form.Item wrapperCol={{ offset: 8, span: 16 }}>
            <Button type="primary" htmlType="submit">
              Submit
            </Button>
          </Form.Item>
        </Form>
      </Modal>
    );
  });
}

CodeMirror.defineExtension("insert_link", async function () {
  // @ts-ignore
  const cm = this;

  const default_display = cm.getSelection();
  const mode = cm.get_edit_mode();

  // HTML target option not supported for md, rst, and tex, which have
  // their own notation for links (and always open externally).
  const show_target = ["md", "rst", "tex"].indexOf(mode) == -1;

  let opts: Options | undefined = undefined;
  try {
    opts = await get_insert_link_opts_from_user(default_display, show_target);
  } catch (err) {
    alert_message({ type: "error", message: err.errorFields[0]?.errors });
    return;
  }

  if (opts == null) {
    return; // user cancelled
  }

  const selections = cm.listSelections();
  selections.reverse();
  for (const sel of selections) {
    const link = insert_link(cm.get_edit_mode(sel.head), opts);
    if (sel.empty()) {
      cm.replaceRange(link, sel.head);
    } else {
      cm.replaceRange(link, sel.from(), sel.to());
    }
  }
});
