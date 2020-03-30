/*
Range slider to select two versions in order to see the diff between them.

Uses https://github.com/tajo/react-range
*/

import { List } from "immutable";
import { Range } from "react-range";
import { Component, React, Rendered } from "../../app-framework";
import { TimeTravelActions } from "./actions";
import { TimeAgo } from "../../r_misc";

interface Props {
  id: string;
  actions: TimeTravelActions;

  versions: List<Date>;
  version0?: number;
  version1?: number;
  max: number;
}

export class RangeSlider extends Component<Props> {
  private handle_change(values: number[]): void {
    if (values[0] == null || values[1] == null) {
      throw Error("invalid values");
    }
    this.props.actions.set_versions(this.props.id, values[0], values[1]);
  }

  private render_thumb({ index, props, isDragged }): Rendered {
    const version = index == 0 ? this.props.version0 : this.props.version1;
    if (version == null) return; // shouldn't happen
    const date = this.props.versions.get(version);
    if (date == null) return; // shouldn't happen
    return (
      <div
        {...props}
        style={{
          ...props.style,
          opacity: 0.8,
          height: "42px",
          width: "90px",
          borderRadius: "4px",
          backgroundColor: "#FFF",
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          boxShadow: "0px 2px 6px #AAA",
        }}
      >
        <div
          style={{
            position: "absolute",
            top: "-28px",
            color: "#fff",
            fontWeight: "bold",
            fontSize: "11px",
            overflowX: "hidden",
            fontFamily: "Arial,Helvetica Neue,Helvetica,sans-serif",
            padding: "4px",
            borderRadius: "4px",
            backgroundColor: "rgb(66, 139, 202)",
          }}
        >
          <TimeAgo date={date} />
        </div>
        <div
          style={{
            height: "16px",
            width: "5px",
            backgroundColor: isDragged ? "rgb(66, 139, 202)" : "#CCC",
          }}
        />
      </div>
    );
  }

  private render_track({ props, children }): Rendered {
    return (
      <div
        {...props}
        style={{
          ...props.style,
          height: "6px",
          width: "100%",
          backgroundColor: "#ccc",
        }}
      >
        {children}
      </div>
    );
  }

  public render(): Rendered {
    if (
      this.props.version0 == null ||
      this.props.version1 == null ||
      this.props.max < 0 ||
      this.props.version0 < 0 ||
      this.props.version1 > this.props.max
    )
      return <div />;
    return (
      <div
        style={{
          height: "72px",
          paddingTop: "48px",
          width: "90%",
          margin: "auto",
        }}
      >
        <Range
          min={0}
          max={this.props.max}
          values={[this.props.version0, this.props.version1]}
          onChange={this.handle_change.bind(this)}
          renderThumb={this.render_thumb.bind(this)}
          renderTrack={this.render_track.bind(this)}
        />
      </div>
    );
  }
}
