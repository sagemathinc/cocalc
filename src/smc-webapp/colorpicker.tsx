/*
###############################################################################
#
# All of the code below has been dedicated to the public domain by the authors.
#
###############################################################################

###
# AUTHORS:
#    - Travis Scholl
#    - Vivek Venkatachalam
###

WARNING: I (wstein) tried to use this component in two places in cocalc and it
blew up in my face.  I.e., it has some weird hidden global shared state.
Try to integrate maybe something like react-color instead, though my
attempt to do tht broke lots of other things (strangely).
*/
import { React, Component } from "./app-framework"; // TODO: this will move

// TODO: when upgrade to react@>=16.3, we can use React.createRef instead of call backrefs below.

function percent_to_color(x: number) {
  if (x < 0.2) {
    return [255, Math.floor((255 * x) / 0.2), 0];
  }
  if (x < 0.4) {
    return [Math.floor(255 * (1 - (x - 0.2) / 0.2)), 255, 0];
  }
  if (x < 0.6) {
    return [0, 255, Math.floor((255 * (x - 0.4)) / 0.2)];
  }
  if (x < 0.8) {
    return [0, Math.floor(255 * (1 - (x - 0.6) / 0.2)), 255];
  }
  return [Math.floor((255 * (x - 0.8)) / 0.2), 0, 255];
}

interface ColorPickerProps {
  color?: string; // defaults to #aaa
  style?: object; // defaults to {}
  onChange?: (color: string) => void; // defaults to () => undefined
}

export class ColorPicker extends Component<ColorPickerProps, {}> {
  private svgRef: any;
  private panelRef: any;
  shouldComponentUpdate(nextProps: any) {
    return nextProps.color !== this.props.color;
  }
  handleClick = (e: any) => {
    const pt = this.svgRef.createSVGPoint();
    [pt.x, pt.y] = [e.clientX, e.clientY];
    const cpt = pt.matrixTransform(this.svgRef.getScreenCTM().inverse());
    const [r, g, b] = percent_to_color(cpt.x / 800);
    if (this.props.onChange) {
      this.props.onChange(`rgb(${r},${g},${b})`);
    }
  };
  render() {
    const { color = "#aaa", style = {} } = this.props;
    return (
      <div style={style}>
        <svg
          ref={(el: any) => (this.svgRef = el)}
          viewBox="0 0 800 400"
          style={{ cursor: "crosshair" }}
          onClick={this.handleClick}
          onMouseEnter={() => (this.panelRef.style.fill = "url(#rb)")}
          onMouseLeave={() => (this.panelRef.style.fill = "none")}
        >
          <g>
            <defs>
              <linearGradient id="rb">
                <stop offset="0%" stopColor="#ff0000" />
                <stop offset="20%" stopColor="#ffff00" />
                <stop offset="40%" stopColor="#00ff00" />
                <stop offset="60%" stopColor="#00ffff" />
                <stop offset="80%" stopColor="#0000ff" />
                <stop offset="100%" stopColor="#ff00ff" />
              </linearGradient>
            </defs>
            <rect fill={color} width="800" height="400" />
            <rect
              ref={(el: any) => (this.panelRef = el)}
              fill="none"
              y="100"
              width="800"
              height="300"
            />
          </g>
          <rect
            fill="none"
            stroke="#000"
            strokeWidth="10"
            width="800"
            height="400"
          />
        </svg>
      </div>
    );
  }
}
