import { delay } from "awaiting";

import { List, Map } from "immutable";

import { Icon, Loading } from "../../../r_misc";

import {
  Component,
  React,
  Rendered,
  rtypes,
  rclass
} from "../../../app-framework";

import { redux_name } from "../jupyter-actions";

import { JupyterEditorActions } from "../actions";

interface Props {
  actions: JupyterEditorActions;
  id: string;
  font_size: number;

  // REDUX PROPS
  contents?: List<Map<string, any>>;
}

class TableOfContents extends Component<Props> {
  public shouldComponentUpdate(nextProps): boolean {
    return (
      this.props.contents != nextProps.contents ||
      this.props.font_size != nextProps.font_size
    );
  }

  public static reduxProps({ name }) {
    const name_of_jupyter_store = redux_name(name);
    return {
      [name_of_jupyter_store]: {
        contents: rtypes.immutable.List
      }
    };
  }

  private render_header(level: number, value: string, icon: string): Rendered {
    const style = { marginTop: 0 };
    const elt = (
      <>
        <Icon name={icon} style={{ width: "30px", display: "inline-block" }} />{" "}
        <a>{value}</a>
      </>
    );

    switch (level) {
      case 1:
        return <h1 style={style}>{elt}</h1>;
      case 2:
        return <h2 style={style}>{elt}</h2>;
      case 3:
        return <h3 style={style}>{elt}</h3>;
      case 4:
        return <h4 style={style}>{elt}</h4>;
      case 5:
        return <h5 style={style}>{elt}</h5>;
      default:
        return <h6 style={style}>{elt}</h6>;
    }
  }

  private async jump_to_cell(id: string): Promise<void> {
    this.props.actions.jump_to_cell(id);
    await delay(100); // temporary hack
    this.props.actions.jump_to_cell(id);
  }

  private render_contents(): Rendered {
    const contents = this.props.contents;
    if (contents == null) return this.render_loading();
    const v: Rendered[] = [];
    // todo: make better use of immutable.js, etc.
    for (let { id, level, value, icon, number } of contents.toJS()) {
      if (number != null) {
        value = `${number.join(".")}.  ${value}`;
      }
      v.push(
        <div
          key={id}
          onClick={() => this.jump_to_cell(id)}
          style={{ cursor: "pointer", paddingLeft: `${level * 2}em` }}
        >
          {this.render_header(level, value, icon)}
        </div>
      );
    }
    return (
      <div
        style={{
          overflowY: "auto",
          margin: "15px",
          fontSize: `${this.props.font_size - 4}px`
        }}
      >
        {v}
      </div>
    );
  }

  private render_loading(): Rendered {
    return <Loading theme="medium" />;
  }

  public render(): Rendered {
    if (this.props.contents == null) {
      return this.render_loading();
    } else {
      return this.render_contents();
    }
  }
}

const tmp = rclass(TableOfContents);
export { tmp as TableOfContents };
