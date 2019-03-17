import { List } from "immutable";
declare const $: any;
import { React, Component, Rendered } from "smc-webapp/app-framework";
import { is_array } from "smc-util/misc2";
import { javascript_eval } from "./javascript-eval";

interface JavascriptProps {
  value: string | List<string>;
}

export class Javascript extends Component<JavascriptProps> {
  private node: HTMLElement;

  componentDidMount(): void {
    const element = $(this.node);
    element.empty();
    let value: string[];
    if (typeof this.props.value == "string") {
      value = [this.props.value];
    } else {
      const x = this.props.value.toJS();
      if (!is_array(x)) {
        console.warn("not evaluating javascript since wrong type:", x);
        return;
      } else {
        value = x;
      }
    }
    let block: string;
    for (block of value) {
      javascript_eval(block, element);
    }
  }

  render(): Rendered {
    return <div />;
  }
}
