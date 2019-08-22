import { List, Map } from "immutable";

import {
  Component,
  React,
  Rendered,
  rtypes,
  rclass
} from "../../../app-framework";
import { Loading } from "../../../r_misc/loading";

import { redux_name } from "../jupyter-actions";

import { parse_headings, TableOfContentsInfo } from "./parse";

import { JupyterEditorActions } from "../actions";

interface Props {
  actions: JupyterEditorActions;
  id: string;

  // REDUX PROPS
  cell_list?: List<string>; // list of ids of cells in order
  cells?: Map<string, any>; // map from ids to cells
}

class TableOfContents extends Component<Props> {
  private headings?: TableOfContentsInfo[];

  public shouldComponentUpdate(nextProps): boolean {
    return this.props.cells != nextProps.cells;
  }

  public componentWillReceiveProps(nextProps): void {
    if (this.props.cells != nextProps.cells) {
      delete this.headings;
    }
  }

  private get_headings(): TableOfContentsInfo[] | undefined {
    if (this.props.cells == null || this.props.cell_list == null) return;
    if (this.headings == null) {
      this.headings = parse_headings(this.props.cells, this.props.cell_list);
    }
    return this.headings;
  }

  public static reduxProps({ name }) {
    const name_of_jupyter_store = redux_name(name);
    return {
      [name_of_jupyter_store]: {
        cell_list: rtypes.immutable.List,
        cells: rtypes.immutable.Map
      }
    };
  }

  private render_header(level: number, value: string): Rendered {
    switch (level) {
      case 1:
        return <h1>{value}</h1>;
      case 2:
        return <h2>{value}</h2>;
      case 3:
        return <h3>{value}</h3>;
      case 4:
        return <h4>{value}</h4>;
      case 5:
        return <h5>{value}</h5>;
      default:
        return <h6>{value}</h6>;
    }
  }

  private render_contents(): Rendered {
    const headings = this.get_headings();
    if (headings == null) return this.render_loading();
    const v: Rendered[] = [];
    for (let { id, level, value } of headings) {
      v.push(
        <div
          key={id}
          onClick={() => this.props.actions.jump_to_cell(id)}
          style={{ cursor: "pointer" }}
        >
          {this.render_header(level, value)}
        </div>
      );
    }
    return <div style={{ overflowY: "auto", margin: "15px" }}>{v}</div>;
  }

  private render_loading(): Rendered {
    return <Loading theme="medium" />;
  }

  public render(): Rendered {
    if (this.props.cell_list == null || this.props.cells == null)
      return this.render_loading();
    else return this.render_contents();
  }
}

const tmp = rclass(TableOfContents);
export { tmp as TableOfContents };
