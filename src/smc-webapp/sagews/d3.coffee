$ = window.$
misc = require('smc-util/misc')
{defaults, required} = misc

# load the npm install'd d3;  NOTE!: just doing require('d3') itself fails with webpack for unknown reasons.
d3 = require('d3/d3')

# Make d3 available to users in general.
window?.d3 = d3

$.fn.extend
    d3: (opts={}) ->
        opts = defaults opts,
            viewer : required
            data   : required
        @each () ->
            t = $(this)
            elt = $("<div>")
            t.replaceWith(elt)
            switch opts.viewer
                when 'graph'
                    d3_graph(elt, opts.data)
                else
                    elt.append($("<span>unknown d3 viewer '#{opts.viewer}'</span>"))
            return elt

# Rewrite of code in Sage by Nathann Cohen.
d3_graph = (elt, graph) ->
    color  = d3.scale.category20()   # List of colors
    width  = graph.width
    if not width?
        width = Math.min(elt.width(), 700)
    height = graph.height
    if not height?
        height = .6*width
    elt.width(width); elt.height(height)
    elt.addClass("smc-d3-graph")

    #dbg = (m) -> console.log("d3_graph: #{JSON.stringify(m)}")
    #dbg([width, height])

    force = d3.layout.force()
        .charge(graph.charge)
        .linkDistance(graph.link_distance)
        .linkStrength(graph.link_strength)
        .gravity(graph.gravity)
        .size([width, height])
        .links(graph.links)
        .nodes(graph.nodes)

    # Returns the coordinates of a point located at distance d from the
    # barycenter of two points pa, pb.
    third_point_of_curved_edge = (pa, pb, d) ->
        dx = pb.x - pa.x
        dy = pb.y - pa.y
        ox = pa.x
        oy = pa.y
        dx = pb.x
        dy = pb.y
        cx = (dx + ox)/2
        cy = (dy + oy)/2
        ny = -(dx - ox)
        nx = dy - oy
        nn = Math.sqrt(nx*nx + ny*ny)
        return [cx+d*nx/nn, cy+d*ny/nn]

    # Applies a transformation to the points of the graph respecting the
    # aspect ratio, so that the graph takes the whole rendering target
    # and is centered
    center_and_scale = (graph) ->
        minx = graph.pos[0][0]
        maxx = graph.pos[0][0]
        miny = graph.pos[0][1]
        maxy = graph.pos[0][1]

        graph.nodes.forEach (d,i) ->
            maxx = Math.max(maxx, graph.pos[i][0])
            minx = Math.min(minx, graph.pos[i][0])
            maxy = Math.max(maxy, graph.pos[i][1])
            miny = Math.min(miny, graph.pos[i][1])

        border = 60
        xspan  = maxx - minx
        yspan  = maxy - miny

        scale  = Math.min((height - border)/yspan, (width - border)/xspan)
        xshift = (width - scale*xspan)/2
        yshift = (height - scale*yspan)/2

        force.nodes().forEach (d,i) ->
            d.x = scale*(graph.pos[i][0] - minx) + xshift
            d.y = scale*(graph.pos[i][1] - miny) + yshift

    # Adapts the graph layout to the window's dimensions
    if graph.pos.length != 0
        center_and_scale(graph)

    # SVG
    id = 'a' + misc.uuid()
    elt.attr('id', id)
    svg = d3.select("##{id}").append("svg")
        .attr("width", width)
        .attr("height", height)

    # Edges
    link = svg.selectAll(".link")
        .data(force.links())
        .enter().append("path")
        .attr("class", (d) -> "link directed")
        .attr("marker-end", (d) -> "url(#directed)")
        .style("stroke", (d) -> d.color)
        .style("stroke-width", graph.edge_thickness+"px")

    # Loops
    loops = svg.selectAll(".loop")
        .data(graph.loops)
        .enter().append("circle")
        .attr("class", "link")
        .attr("r", (d) -> d.curve)
        .style("stroke", (d) -> d.color)
        .style("stroke-width", graph.edge_thickness+"px")

    # Nodes
    node = svg.selectAll(".node")
        .data(force.nodes())
        .enter().append("circle")
        .attr("class", "node")
        .attr("r", graph.vertex_size)
        .style("fill", (d) -> color(d.group))
        .call(force.drag)

    node.append("title").text((d) -> d.name)

    # Vertex labels
    if graph.vertex_labels
        v_labels = svg.selectAll(".v_label")
            .data(force.nodes())
            .enter()
            .append("svg:text")
            .attr("vertical-align", "middle")
            .text((d)-> return d.name)

    # Edge labels
    if graph.edge_labels
        e_labels = svg.selectAll(".e_label")
            .data(force.links())
            .enter()
            .append("svg:text")
            .attr("text-anchor", "middle")
            .text((d) -> d.name)

        l_labels = svg.selectAll(".l_label")
            .data(graph.loops)
            .enter()
            .append("svg:text")
            .attr("text-anchor", "middle")
            .text((d,i) -> graph.loops[i].name)

    # Arrows, for directed graphs
    if graph.directed
        svg.append("svg:defs").selectAll("marker")
            .data(["directed"])
            .enter().append("svg:marker")
            .attr("id", String)
            # viewbox is a rectangle with bottom-left corder (0,-2), width 4 and height 4
            .attr("viewBox", "0 -2 4 4")
            # This formula took some time ... :-P
            .attr("refX", Math.ceil(2*Math.sqrt(graph.vertex_size)))
            .attr("refY", 0)
            .attr("markerWidth", 4)
            .attr("markerHeight", 4)
            .attr("orient", "auto")
            .append("svg:path")
            # triangles with endpoints (0,-2), (4,0), (0,2)
            .attr("d", "M0,-2L4,0L0,2")

            #.attr("preserveAspectRatio",false) # SMELL: this gives an error.

    # The function 'line' takes as input a sequence of tuples, and returns a
    # curve interpolating these points.
    line = d3.svg.line()
        .interpolate("cardinal")
        .tension(.2)
        .x((d) -> d.x)
        .y((d) -> d.y)

    # This is where all movements are defined
    force.on "tick", () ->

        # Position of vertices
        node.attr("cx", (d) -> d.x)
            .attr("cy", (d) -> d.y)

        # Position of edges
        link.attr "d", (d) ->
            # Straight edges
            if d.curve == 0
                return "M#{d.source.x},#{d.source.y} L#{d.target.x},#{d.target.y}"
            # Curved edges
            else
                p = third_point_of_curved_edge(d.source,d.target,d.curve)
                return line([{'x':d.source.x,'y':d.source.y},
                             {'x':p[0],'y':p[1]},
                             {'x':d.target.x,'y':d.target.y}])

        # Position of Loops
        if graph.loops.length != 0
            loops
                .attr("cx", (d) -> return force.nodes()[d.source].x)
                .attr("cy", (d) -> return force.nodes()[d.source].y-d.curve)

        # Position of vertex labels
        if graph.vertex_labels
            v_labels
            .attr("x", (d) -> d.x+graph.vertex_size)
            .attr("y", (d) -> return d.y)

        # Position of the edge labels
        if graph.edge_labels
            e_labels
                .attr("x", (d) -> third_point_of_curved_edge(d.source,d.target,d.curve+3)[0])
                .attr("y", (d) -> third_point_of_curved_edge(d.source,d.target,d.curve+3)[1])
            l_labels
                .attr("x", (d,i) -> force.nodes()[d.source].x)
                .attr("y", (d,i) -> force.nodes()[d.source].y-2*d.curve-1)

    # Starts the automatic force layout
    force.start()
    if graph.pos.length != 0
        force.tick()
        force.stop()
        graph.nodes.forEach (d,i) ->
            d.fixed = true

