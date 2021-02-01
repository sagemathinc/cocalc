/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import * as CodeMirror from "codemirror";
import { Button, Form, Input, Modal } from "antd";
import { React } from "../../app-framework";
import { show_react_modal } from "../../misc-page";
import { Icon } from "../../r_misc";
import { alert_message } from "../../alerts";

export interface Options {
  url: string;
  title: string;
  height: string;
  width: string;
}

function insert_image(mode: string, opts: Options): string {
  let { url, title, height, width } = opts;
  let s = "";

  if (mode === "rst") {
    // .. image:: picture.jpeg
    //    :height: 100px
    //    :width: 200 px
    //    :alt: alternate text
    //    :align: right
    s = `\n.. image:: ${url}\n`;
    if (height.length > 0) {
      s += `   :height: ${height}px\n`;
    }
    if (width.length > 0) {
      s += `   :width: ${width}px\n`;
    }
    if (title.length > 0) {
      s += `   :alt: ${title}\n`;
    }
  } else if (mode === "md" && width.length === 0 && height.length === 0) {
    // use markdown's funny image format if width/height not given
    if (title.length > 0) {
      title = ` \"${title}\"`;
    }
    s = `![](${url}${title})`;
  } else if (mode === "tex") {
    //cm.tex_ensure_preamble("\\usepackage{graphicx}");
    const w = parseInt(width);
    if (isNaN(w)) {
      width = "0.8";
    } else {
      width = `${w / 100.0}`;
    }
    if (title.length > 0) {
      s = `\
\\begin{figure}[p]
    \\centering
    \\includegraphics[width=${width}\\textwidth]{${url}}
    \\caption{${title}}
\\end{figure}\
`;
    } else {
      s = `\\includegraphics[width=${width}\\textwidth]{${url}}`;
    }
  } else if (mode === "mediawiki") {
    // https://www.mediawiki.org/wiki/Help:Images
    // [[File:Example.jpg|<width>[x<height>]px]]
    let size = "";
    if (width.length > 0) {
      size = `|${width}`;
      if (height.length > 0) {
        size += `x${height}`;
      }
      size += "px";
    }
    s = `[[File:${url}${size}]]`;
  } else {
    // fallback for mode == "md" but height or width is given
    if (title.length > 0) {
      title = ` title='${title}'`;
    }
    if (width.length > 0) {
      width = ` width=${width}`;
    }
    if (height.length > 0) {
      height = ` height=${height}`;
    }
    s = `<img src='${url}'${width}${height}${title} />`;
  }
  return s;
}

export async function get_insert_image_opts_from_user(): Promise<undefined | Options> {
  return await show_react_modal((cb) => {
    return (
      <Modal
        title={
          <h3>
            <Icon name="image" /> Insert Image
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
            width: "",
            height: "",
            title: "",
          }}
          onFinish={(values) => cb(undefined, values)}
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
          <Form.Item label="Width" name="width">
            <Input placeholder="Width..." />
          </Form.Item>
          <Form.Item label="Height" name="height">
            <Input placeholder="Height..." />
          </Form.Item>
          <Form.Item label="Title" name="title">
            <Input placeholder="Title..." />
          </Form.Item>
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

CodeMirror.defineExtension("insert_image", async function (): Promise<void> {
  // @ts-ignore
  const cm = this;
  let opts: Options | undefined = undefined;
  try {
    opts = await get_insert_image_opts_from_user();
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
    const link = insert_image(cm.get_edit_mode(sel.head), opts);
    if (sel.empty()) {
      cm.replaceRange(link, sel.head);
    } else {
      cm.replaceRange(link, sel.from(), sel.to());
    }
  }
});
