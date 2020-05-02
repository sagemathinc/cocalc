/* 
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
 * decaffeinate suggestions:
 * DS102: Remove unnecessary code created because of implicit returns
 * DS104: Avoid inline assignments
 * DS202: Simplify dynamic range loops
 * DS205: Consider reworking code to avoid use of IIFEs
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
/*
This is a crazy idea to test writing a renderer directly using PEG.

https://github.com/siefkenj/latex-parser
*/

import katex from "katex";

import { throttle } from "underscore";

import {
  Fragment,
  React,
  ReactDOM,
  rclass,
  rtypes,
} from "smc-webapp/app-framework";

import { Alert } from "react-bootstrap";

import misc from "smc-util/misc";

import { parse as latex_peg_parse } from "./peg/latex";

const InlineMath = rclass({
  displayName: "LaTeXEditor-PEG-InlineMath",

  propTypes: {
    value: rtypes.string.isRequired,
  },

  katex() {
    return katex.renderToString(this.props.value, { displayMode: false });
  },

  render() {
    return <span dangerouslySetInnerHTML={{ __html: this.katex() }} />;
  },
});

const DisplayMath = rclass({
  displayName: "LaTeXEditor-PEG-DisplayMath",

  propTypes: {
    value: rtypes.string.isRequired,
  },

  katex() {
    return katex.renderToString(this.props.value, { displayMode: true });
  },

  render() {
    return (
      <div
        style={{ textAlign: "center" }}
        dangerouslySetInnerHTML={{ __html: this.katex() }}
      />
    );
  },
});

const Verbatim = rclass({
  displayName: "LaTeXEditor-PEG-Verbatim",

  propTypes: {
    content: rtypes.string.isRequired,
  },

  render() {
    return (
      <code
        style={{
          display: "block",
          marginTop: "1em",
          whiteSpace: "pre",
        }}
      >
        {this.props.content}
      </code>
    );
  },
});

const Title = rclass({
  displayName: "LaTeXEditor-PEG-Title",

  propTypes: {
    state: rtypes.object,
  },

  render_date() {
    if (this.props.state.date != null) {
      return render_group(this.props.state.date, this.props.state);
    } else {
      // Not quite right...
      return new Date().toDateString();
    }
  },

  render() {
    return (
      <div style={{ textAlign: "center" }}>
        <h1>{render_group(this.props.state.title, this.props.state)}</h1>
        <div style={{ fontSize: "15pt" }}>
          {render_group(this.props.state.author, this.props.state)}
        </div>
        <div style={{ fontSize: "15pt" }}>{this.render_date()}</div>
      </div>
    );
  },
});

const Macro = rclass({
  displayName: "LaTeXEditor-PEG-Macro",

  propTypes: {
    name: rtypes.string.isRequired, // name of the macro
    args: rtypes.array, // 0 or more arguments
    state: rtypes.object,
  },

  rendered_arg(i) {
    return render_group(this.props.args[i], this.props.state);
  },

  render_section() {
    const { state } = this.props;
    state.section = (state.section != null ? state.section : 0) + 1;
    state.subsection = 0;
    return (
      <h2
        style={{
          fontWeight: "bold",
          marginTop: "3.5ex",
          marginBottom: "2.3ex",
        }}
      >
        {state.section} {this.rendered_arg(0)}
      </h2>
    );
  },

  render_subsection() {
    const { state } = this.props;
    if (state.section == null) {
      state.section = 1;
    }
    state.subsection = (state.subsection != null ? state.subsection : 0) + 1;
    return (
      <h3
        style={{
          fontWeight: "bold",
          marginTop: "3.25ex",
          marginBottom: "1.5ex",
        }}
      >
        {state.section}.{state.subsection} {this.rendered_arg(0)}
      </h3>
    );
  },

  render_subsubsection() {
    const { state } = this.props;
    if (state.section == null) {
      state.section = 1;
    }
    if (state.subsection == null) {
      state.subsection = 1;
    }
    state.subsubsection =
      (state.subsubsection != null ? state.subsubsection : 0) + 1;
    return (
      <h4
        style={{
          fontWeight: "bold",
          marginTop: "3.25ex",
          marginBottom: "1.5ex",
        }}
      >
        {state.section}.{state.subsection}.{state.subsubsection}{" "}
        {this.rendered_arg(0)}
      </h4>
    );
  },

  render_textbf() {
    return <b>{this.rendered_arg(0)}</b>;
  },

  render_textit() {
    return <i>{this.rendered_arg(0)}</i>;
  },

  render_texttt() {
    return (
      <span style={{ fontFamily: "monospace" }}>{this.rendered_arg(0)}</span>
    );
  },

  render_underline() {
    return <u>{this.rendered_arg(0)}</u>;
  },

  render_LaTeX() {
    return <InlineMath value={"\\LaTeX"} />;
  },

  render_hline() {
    return <hr style={{ border: ".5px solid black" }} />;
  },

  render_title() {
    this.props.state.title = this.props.args[0];
  },

  render_author() {
    this.props.state.author = this.props.args[0];
  },

  render_date() {
    this.props.state.date = this.props.args[0];
  },

  render_maketitle() {
    return <Title state={this.props.state} />;
  },

  render_usepackage() {
    return;
  },

  render_label() {
    return;
  },

  render_bibliographystyle() {
    return;
  },

  render_textbackslash() {
    return <span>\</span>;
  },

  render_documentclass() {
    this.props.state.documentclass = this.props.args[0];
  },

  render() {
    if (
      this.props.name.length === 1 &&
      "\"'{}\\~".indexOf(this.props.name) !== -1
    ) {
      return <span>{this.props.name}</span>;
    }

    const f = this[`render_${this.props.name}`];
    if (f != null) {
      let left;
      return (left = f()) != null ? left : <span />;
    } else {
      return <pre>{`\\${this.props.name}(...)`}</pre>;
    }
  },
});

const Environment = rclass({
  displayName: "LaTeXEditor-PEG-Environment",

  propTypes: {
    env: rtypes.array,
    args: rtypes.object,
    content: rtypes.array,
    state: rtypes.object,
  },

  rendered_content() {
    return render_group(this.props.content, this.props.state);
  },

  render_document() {
    return this.rendered_content();
  },

  get_list_items() {
    let asc, end;
    let i;
    const v = [];
    for (
      i = 0, end = this.props.content.length, asc = 0 <= end;
      asc ? i < end : i > end;
      asc ? i++ : i--
    ) {
      if (
        this.props.content[i].TYPE === "macro" &&
        this.props.content[i].content === "item"
      ) {
        v.push(i);
      }
    }
    v.push(this.props.content.length);
    return (() => {
      let asc1, end1;
      const result = [];
      for (
        i = 0, end1 = v.length - 1, asc1 = 0 <= end1;
        asc1 ? i < end1 : i > end1;
        asc1 ? i++ : i--
      ) {
        result.push(
          <li key={i}>
            {render_group(
              this.props.content.slice(v[i] + 1, v[i + 1]),
              this.props.state
            )}
          </li>
        );
      }
      return result;
    })();
  },

  render_abstract() {
    return (
      <div>
        <div style={{ textAlign: "center" }}>
          <b style={{ fontSize: "13pt" }}>Abstract</b>
        </div>
        <p
          style={{
            textIndent: "20px",
            marginLeft: "auto",
            marginRight: "auto",
            maxWidth: "80%",
            marginTop: "15px",
          }}
        >
          {this.rendered_content()}
        </p>
      </div>
    );
  },

  render_itemize() {
    if (this.props.content == null) {
      return;
    }
    return <ul>{this.get_list_items()}</ul>;
  },

  render_enumerate() {
    if (this.props.content == null) {
      return;
    }
    return <ol>{this.get_list_items()}</ol>;
  },

  render_quote() {
    return <blockquote>{this.rendered_content()}</blockquote>;
  },

  render_center() {
    return (
      <div style={{ textIndent: 0, textAlign: "center" }}>
        {this.rendered_content()}
      </div>
    );
  },

  render() {
    if (!this.props.env) {
      return <pre>Environment</pre>;
    }
    const name = this.props.env[0]; // can it be more than one?
    const f = this[`render_${name}`];
    if (f != null) {
      let left;
      return (left = f()) != null ? left : <span />;
    } else {
      return <code>{`\\begin{\\${name}}(...)\\end{\\${name}}`}</code>;
    }
  },
});

const macro_nargs = function (name) {
  switch (name) {
    case "maketitle":
    case "LaTeX":
      return 0;
    case "section":
    case "subsection":
    case "subsubsection":
    case "textbf":
    case "textit":
    case "texttt":
    case "underline":
    case "label":
    case "usepackage":
    case "bibliographystyle":
    case "documentclass":
    case "title":
    case "author":
    case "date":
      return 1;
    case "setcounter":
      return 2;
    default:
      return 0;
  }
};

var render_group = function (group, state) {
  if (!group) {
    return <span />;
  }

  if (typeof group === "string") {
    return <Fragment>{group}</Fragment>;
  }

  const v = [];
  let macro = undefined;

  let i = 0;
  for (let x of group) {
    i += 1;

    if (typeof x === "string") {
      v.push(<Fragment key={i}>{x}</Fragment>);
      continue;
    }

    if (macro != null) {
      if (x.TYPE === "group") {
        macro.args.push(x.content);
        macro.nargs -= 1;
        if (macro.nargs === 0) {
          v.push(
            <Macro key={i} name={macro.name} args={macro.args} state={state} />
          );
          macro = undefined;
        }
      }
      continue;
    }

    switch (x.TYPE) {
      case "inlinemath":
        v.push(<span key={i}>math</span>);
        break;
      case "displaymath":
        v.push(<div key={i}>math</div>);
        break;
      case "macro":
        var name = x.content;
        var nargs = macro_nargs(name);
        if (nargs === 0) {
          v.push(<Macro key={i} name={name} state={state} />);
        } else {
          macro = {
            name,
            nargs,
            args: [],
          };
        }
        break;
      case "whitespace":
        v.push(<Fragment key={i}> </Fragment>);
        break;
      case "parbreak":
        v.push(<br key={i} />);
        v.push(
          <span
            key={i + "b"}
            style={{ display: "inline-block", marginRight: "2em" }}
          />
        );
        break;
      case "verbatim":
        v.push(<Verbatim key={i} content={x.content} />);
        break;
      case "environment":
        v.push(
          <Environment
            key={i}
            env={x.env}
            args={x.args}
            content={x.content}
            state={state}
          />
        );
        break;
      case "comment":
        continue;
        break;
      case "group":
        v.push(render_group(x.content, state));
        break;
      default:
        // not implemented yet.
        v.push(<pre key={i}>{JSON.stringify(x, null, "  ")}</pre>);
    }
  }

  return v;
};

const LaTeX = rclass({
  displayName: "LaTeXEditor-PEG-LaTeX",

  propTypes: {
    value: rtypes.string,
  },

  render_parse(parsed) {
    return <pre>{JSON.stringify(parsed, null, "  ")}</pre>;
  },

  render_error(err) {
    return <Alert bsStyle={"danger"}>#{`${err}`}</Alert>;
  },

  render() {
    let parsed;
    if (this.props.value == null) {
      return <span />;
    }
    try {
      parsed = latex_peg_parse(this.props.value);
    } catch (err) {
      return this.render_error(err);
    }
    const state = {};
    return (
      <div>
        {render_group(parsed, state)}
        <br />
        <hr />
        <br />
        {this.render_parse(parsed)}
      </div>
    );
  },
});

export let PEG = rclass({
  displayName: "LaTeXEditor-PEG",

  propTypes: {
    id: rtypes.string.isRequired,
    actions: rtypes.object.isRequired,
    editor_state: rtypes.immutable.Map,
    is_fullscreen: rtypes.bool,
    project_id: rtypes.string,
    path: rtypes.string,
    reload: rtypes.number,
    font_size: rtypes.number,
    value: rtypes.string,
    content: rtypes.string,
  },

  shouldComponentUpdate(next) {
    return misc.is_different(this.props, next, [
      "id",
      "project_id",
      "path",
      "font_size",
      "read_only",
      "value",
      "content",
      "reload_images",
    ]);
  },

  on_scroll() {
    const elt = ReactDOM.findDOMNode(this.refs.scroll);
    if (elt == null) {
      return;
    }
    const scroll = $(elt).scrollTop();
    return this.props.actions.save_editor_state(this.props.id, { scroll });
  },

  componentDidMount() {
    this.restore_scroll();
    setTimeout(this.restore_scroll, 200);
    return setTimeout(this.restore_scroll, 500);
  },

  componentDidUpdate() {
    return setTimeout(this.restore_scroll, 1);
  },

  restore_scroll() {
    const scroll =
      this.props.editor_state != null
        ? this.props.editor_state.get("scroll")
        : undefined;
    if (scroll != null) {
      const elt = ReactDOM.findDOMNode(this.refs.scroll);
      if (elt != null) {
        return $(elt).scrollTop(scroll);
      }
    }
  },

  render() {
    return (
      <div
        ref={"scroll"}
        onScroll={throttle(this.on_scroll, 250)}
        className={"smc-vfill"}
        style={{
          background: "white",
          padding: "15px",
          overflowY: "scroll",
          width: "100%",
          zoom: (this.props.font_size != null ? this.props.font_size : 16) / 16,
          fontFamily: "Computer Modern",
          textAlign: "justify",
        }}
      >
        <LaTeX value={this.props.value} />
      </div>
    );
  },
});
