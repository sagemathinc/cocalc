/*
 * decaffeinate suggestions:
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
/*
This is a renderer using LaTeX.js, which is purely client side.

https://github.com/michael-brade/LaTeX.js
*/

import { throttle } from "underscore";

import { React, ReactDOM, rclass, rtypes } from "../app-framework";

import misc from "smc-util/misc";

import { HtmlGenerator } from "smc-webapp/node_modules/latex.js/dist/html-generator.js";

// This CSS can only be used in an iframe...
//require('../node_modules/latex.js/dist/css/base.css')

import { parse } from "latex.js";

import { Loading } from "smc-webapp/r_misc";

const generator = new HtmlGenerator({
  bare: true,
  hyphenate: true,
  languagePatterns: require("hyphenation.en-us")
});

const latexjs = function(latex) {
  generator.reset();
  return parse(latex, { generator });
};

export let LaTeXJS = rclass({
  displayName: "LaTeXEditor-LaTeXJS",

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
    editor_state: rtypes.immutable.Map
  }, // only used for initial render

  shouldComponentUpdate(next) {
    return misc.is_different(this.props, next, [
      "id",
      "project_id",
      "path",
      "font_size",
      "read_only",
      "value",
      "reload_images"
    ]);
  },

  on_scroll() {
    const elt = ReactDOM.findDOMNode(this.refs.scroll);
    if (!elt) {
      return;
    }
    const scroll = $(elt).scrollTop();
    this.props.actions.save_editor_state(this.props.id, { scroll });
  },

  componentDidMount() {
    this.update_latexjs(this.props.value);
    this.restore_scroll();
    setTimeout(this.restore_scroll, 200);
    setTimeout(this.restore_scroll, 500);
  },

  componentDidUpdate() {
    setTimeout(this.restore_scroll, 1);
  },

  restore_scroll() {
    const e = this.props.editor_state;
    if (!e) return;
    const scroll = e.get("scroll");
    if (scroll) {
      const elt = ReactDOM.findDOMNode(this.refs.scroll);
      if (elt) {
        $(elt).scrollTop(scroll);
      }
    }
  },

  update_latexjs(s) {
    let dom;
    if (s == null) {
      return;
    }
    let elt = ReactDOM.findDOMNode(this.refs.scroll);
    if (elt == null) {
      return;
    }
    elt = $(elt);
    try {
      dom = latexjs(s).dom();
    } catch (err) {
      dom = $(`<div>Error -- ${err}</div>`);
    }
    elt.empty();
    elt.append(dom);
  },

  componentDidUpdate(prev) {
    if (prev.value !== this.props.value) {
      this.update_latexjs(this.props.value);
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
          zoom: (this.props.font_size && 16) / 16
        }}
      />
    );
  }
});
