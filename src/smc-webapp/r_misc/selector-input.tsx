/*
 * decaffeinate suggestions:
 * DS101: Remove unnecessary use of Array.from
 * DS102: Remove unnecessary code created because of implicit returns
 * DS205: Consider reworking code to avoid use of IIFEs
 * DS206: Consider reworking classes to avoid initClass
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */

class SelectorInput {
  static initClass() {
    this.prototype.displayName = "Misc-SelectorInput";

    this.prototype.propTypes = {
      selected: rtypes.string,
      on_change: rtypes.func,
      disabled: rtypes.bool
    };
  }

  render_options() {
    let v;
    if (misc.is_array(this.props.options)) {
      let x;
      if (
        this.props.options.length > 0 &&
        typeof this.props.options[0] === "string"
      ) {
        let i = 0;
        v = [];
        for (x of Array.from(this.props.options)) {
          v.push(
            <option key={i} value={x}>
              {x}
            </option>
          );
          i += 1;
        }
        return v;
      } else {
        return (() => {
          const result = [];
          for (x of Array.from(this.props.options)) {
            result.push(
              <option key={x.value} value={x.value}>
                {x.display}
              </option>
            );
          }
          return result;
        })();
      }
    } else {
      v = misc.keys(this.props.options);
      v.sort();
      return (() => {
        const result1 = [];
        for (let value of Array.from(v)) {
          const display = this.props.options[value];
          result1.push(
            <option key={value} value={value}>
              {display}
            </option>
          );
        }
        return result1;
      })();
    }
  }

  render() {
    return (
      <FormGroup>
        <FormControl
          value={this.props.selected}
          componentClass="select"
          ref="input"
          onChange={() =>
            typeof this.props.on_change === "function"
              ? this.props.on_change(
                  ReactDOM.findDOMNode(this.refs.input).value
                )
              : undefined
          }
          disabled={this.props.disabled}
        >
          {this.render_options()}
        </FormControl>
      </FormGroup>
    );
  }
}
SelectorInput.initClass();
