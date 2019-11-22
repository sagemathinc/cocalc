import * as React from "react";
import * as misc from "smc-util/misc";

interface Props {
  name: string;
  className?: string;
  size?: "lg" | "2x" | "3x" | "4x" | "5x";
  rotate?: "45" | "90" | "135" | "180" | "225" | "270" | "315";
  flip?: "horizontal" | "vertical";
  fixedWidth?: boolean;
  spin?: boolean;
  pulse?: boolean;
  stack?: "1x" | "2x";
  inverse?: boolean;
  Component?: JSX.Element | JSX.Element[];
  style?: any;
  onClick?: (event?: any) => void; // TODO tighten what event could be
  onMouseOver?: () => void;
  onMouseOut?: () => void;
}

// Converted from https://github.com/andreypopp/react-fa
export class Icon extends React.Component<Props> {
  static defaultProps = {
    name: "square-o",
    onClick: undefined
  };

  shouldComponentUpdate(next) {
    // we exclude style changes for speed reasons (and style is rarely used); always update if there are children
    return (
      this.props.children != null ||
      misc.is_different(this.props, next, [
        "name",
        "size",
        "rotate",
        "flip",
        "spin",
        "pulse",
        "fixedWidth",
        "stack",
        "inverse",
        "className"
      ]) ||
      !misc.is_equal(this.props.style, next.style)
    );
  }

  render_icon() {
    let classNames;
    let {
      name,
      size,
      rotate,
      flip,
      spin,
      pulse,
      fixedWidth,
      stack,
      inverse,
      className
    } = this.props;

    let i = name.indexOf("cc-icon");

    if (i !== -1 && spin) {
      // Temporary workaround because cc-icon-cocalc-ring is not a font awesome JS+SVG icon, so
      // spin, etc., doesn't work on it.  There is a discussion at
      // https://stackoverflow.com/questions/19364726/issue-making-bootstrap3-icon-spin
      // about spinning icons, but it's pretty subtle and hard to get right, so I hope
      // we don't have to implement our own.  Also see
      // "Icon animation wobble foibles" at https://fontawesome.com/how-to-use/web-fonts-with-css
      // where they say "witch to the SVG with JavaScript version, it's working a lot better for this".
      name = "fa-circle-notch";
      i = -1;
    }

    if (i !== -1) {
      // A custom Cocalc font icon.  Don't even bother with font awesome at all!
      classNames = name.slice(i);
    } else {
      const left = name.slice(0, 3);
      if (left === "fas" || left === "fab" || left === "far") {
        // version 5 names are different!  https://fontawesome.com/how-to-use/use-with-node-js
        // You give something like: 'fas fa-blah'.
        classNames = name;
      } else {
        // temporary until file_associations can be changed
        if (name.slice(0, 3) === "cc-" && name !== "cc-stripe") {
          classNames = `fab ${name}`;
          // the cocalc icon font can't do any extra tricks
        } else {
          // temporary until file_associations can be changed
          if (name.slice(0, 3) === "fa-") {
            classNames = `fa ${name}`;
          } else {
            classNames = `fa fa-${name}`;
          }
        }
      }
      // These only make sense for font awesome.
      if (size) {
        classNames += ` fa-${size}`;
      }
      if (rotate) {
        classNames += ` fa-rotate-${rotate}`;
      }
      if (flip) {
        classNames += ` fa-flip-${flip}`;
      }
      if (fixedWidth) {
        classNames += " fa-fw";
      }
      if (spin) {
        classNames += " fa-spin";
      }
      if (pulse) {
        classNames += " fa-pulse";
      }
      if (stack) {
        classNames += ` fa-stack-${stack}`;
      }
      if (inverse) {
        classNames += " fa-inverse";
      }
    }

    if (className) {
      classNames += ` ${className}`;
    }
    return <i className={classNames} />;
  }

  render() {
    // Wrap in a span for **two** reasons.
    // 1. A reasonable one -- have to wrap the i, since when rendered using js and svg by new fontawesome 5,
    // the click handlers of the <i> object are just ignored, since it is removed from the DOM!
    // This is important the close button on tabs.
    // 2. An evil one -- FontAwesome's javascript mutates the DOM.  Thus we put a random key in so,
    // that React just replaces the whole part of the DOM where the SVG version of the icon is,
    // and doesn't get tripped up by this.   A good example where this is used is when *running* Jupyter
    // notebooks.
    return (
      <span
        onClick={this.props.onClick}
        onMouseOver={this.props.onMouseOver}
        onMouseOut={this.props.onMouseOut}
        key={Math.random()}
        style={this.props.style}
      >
        {this.render_icon()}
      </span>
    );
  }
}
