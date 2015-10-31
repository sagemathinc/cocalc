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

React = require "react"
ReactDOM = require('react-dom')

percent_to_color = (x) ->
  switch
    when x<0.2 then [255,Math.floor(255*x/0.2),0]
    when x<0.4 then [Math.floor(255*(1-(x-0.2)/0.2)),255,0]
    when x<0.6 then [0,255,Math.floor(255*(x-0.4)/0.2)]
    when x<0.8 then [0,Math.floor(255*(1-(x-0.6)/0.2)),255]
    else [Math.floor(255*(x-0.8)/0.2),0,255]

exports.ColorPicker = React.createClass
  displayName: 'ColorPicker'

  propTypes:
      onChange: React.PropTypes.func
      color: React.PropTypes.string
      style: React.PropTypes.object

  getDefaultProps: ->
      color: "#aaa"
      style: {}

  shouldComponentUpdate: (nextProps, nextState) ->
    nextProps.color isnt @props.color

  _click: (e) ->
    pt = ReactDOM.findDOMNode(@refs["svg"]).createSVGPoint()
    [pt.x, pt.y] = [e.clientX, e.clientY]
    cpt =  pt.matrixTransform ReactDOM.findDOMNode(@refs["svg"]).getScreenCTM().inverse()
    [r,g,b] = percent_to_color cpt.x/800
    @props.onChange? "rgb(#{r},#{g},#{b})"

  render: ->
    <div style={@props.style}>
      <svg ref="svg"
        viewBox="0 0 800 400" style={{cursor:"crosshair"}}
        onClick={@_click}
        onMouseEnter={=>ReactDOM.findDOMNode(@refs.panel).style.fill="url(#rb)"}
        onMouseLeave={=>ReactDOM.findDOMNode(@refs.panel).style.fill="none"} >
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
          <rect fill={@props.color} width="800" height="400"/>
          <rect ref="panel" fill="none" y="100" width="800" height="300" />
        </g>
        <rect fill="none" stroke="#000" strokeWidth="10" width="800" height="400"/>
      </svg>
    </div>
