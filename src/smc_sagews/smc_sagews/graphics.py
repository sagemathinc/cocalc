###############################################################################
#
# SageMathCloud: A collaborative web-based interface to Sage, IPython, LaTeX and the Terminal.
#
#    Copyright (C) 2014, William Stein
#
#    This program is free software: you can redistribute it and/or modify
#    it under the terms of the GNU General Public License as published by
#    the Free Software Foundation, either version 3 of the License, or
#    (at your option) any later version.
#
#    This program is distributed in the hope that it will be useful,
#    but WITHOUT ANY WARRANTY; without even the implied warranty of
#    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
#    GNU General Public License for more details.
#
#    You should have received a copy of the GNU General Public License
#    along with this program.  If not, see <http://www.gnu.org/licenses/>.
#
###############################################################################

import json, math
import sage_salvus

from uuid import uuid4
def uuid():
    return str(uuid4())

def json_float(t):
    if t is None:
        return t
    t = float(t)
    # Neither of nan or inf get JSON'd in a way that works properly, for some reason.  I don't understand why.
    if math.isnan(t) or math.isinf(t):
        return None
    else:
        return t

#######################################################
# Three.js based plotting
#######################################################

noneint = lambda n : n if n is None else int(n)

class ThreeJS(object):
    def __init__(self, renderer=None, width=None, height=None,
                 frame=True, background=None, foreground=None,
                 spin=False, viewer=None, aspect_ratio=None,
                 frame_aspect_ratio = None,
                 **ignored):
        """
        INPUT:

        - renderer -- None (automatic), 'canvas2d', or 'webgl'
        - width    -- None (automatic) or an integer
        - height   -- None (automatic) or an integer
        - frame    -- bool (default: True); draw a frame that includes every object.
        - background -- None (transparent); otherwise a color such as 'black' or 'white'
        - foreground -- None (automatic = black if transparent; otherwise opposite of background);
           or a color; this is used for drawing the frame and axes labels.
        - spin -- False; if True, spins 3d plot, with number determining speed (requires webgl and mouse over plot)
        - aspect_ratio -- None (square) or a triple [x,y,z] so that everything is scaled by x,y,z.

        - frame_aspect_ratio -- synonym for aspect_ratio
        - viewer -- synonym for renderer
        """
        if viewer is not None and renderer is None:
            renderer = viewer
        if renderer not in [None, 'webgl', 'canvas', 'canvas2d']:
            raise ValueError("unknown renderer='%s'; it must be None, webgl, or canvas2d"%renderer)
        self._frame    = frame
        self._salvus   = sage_salvus.salvus  # object for this cell
        self._id       = uuid()
        self._selector = "#%s"%self._id
        self._obj      = "$('%s').data('salvus-threejs')"%self._selector
        self._salvus.html("<span id=%s class='salvus-3d-container'></span>"%self._id)
        if not isinstance(spin, bool):
            spin = json_float(spin)
        if frame_aspect_ratio is not None:
            aspect_ratio = frame_aspect_ratio
        if aspect_ratio is not None:
            if aspect_ratio == 1 or aspect_ratio=='automatic':
                aspect_ratio = None
            elif not (isinstance(aspect_ratio, (list, tuple)) and len(aspect_ratio) == 3):
                raise TypeError("aspect_ratio must be None, 1 or a 3-tuple ")
            else:
                aspect_ratio = [json_float(x) for x in aspect_ratio]
        self._salvus.javascript("$('%s').salvus_threejs(obj)"%self._selector,
                                once = False,
                                obj  = {
                                     'renderer'        : renderer,
                                     'width'           : noneint(width),
                                     'height'          : noneint(height),
                                     'background'      : background,
                                     'foreground'      : foreground,
                                     'spin'            : spin,
                                     'aspect_ratio'    : aspect_ratio
                                     })
        self._graphics = []
        self._call('init()')

    def _call(self, s, obj=None):
        cmd = 'misc.eval_until_defined({code:"%s", cb:(function(err, __t__) { __t__ != null ? __t__.%s:void 0 })})'%(
                self._obj, s)
        self._salvus.execute_javascript(cmd, obj=obj)

    def bounding_box(self):
        if not self._graphics:
            return -1,1,-1,1,-1,1
        b = self._graphics[0].bounding_box()
        xmin, xmax, ymin, ymax, zmin, zmax = b[0][0], b[1][0], b[0][1], b[1][1], b[0][2], b[1][2]
        for g in self._graphics[1:]:
            b = g.bounding_box()
            xmin, xmax, ymin, ymax, zmin, zmax = (
                  min(xmin,b[0][0]), max(b[1][0],xmax),
                  min(b[0][1],ymin), max(b[1][1],ymax),
                  min(b[0][2],zmin), max(b[1][2],zmax))
        v = xmin, xmax, ymin, ymax, zmin, zmax
        return [json_float(x) for x in v]

    def frame_options(self):
        xmin, xmax, ymin, ymax, zmin, zmax = self.bounding_box()
        return {'xmin':xmin, 'xmax':xmax, 'ymin':ymin, 'ymax':ymax, 'zmin':zmin, 'zmax':zmax,
                'draw' : self._frame}

    def add(self, graphics3d, **kwds):
        kwds = graphics3d._process_viewing_options(kwds)
        self._graphics.append(graphics3d)
        obj = {'obj'       : graphics3d_to_jsonable(graphics3d),
               'wireframe' : jsonable(kwds.get('wireframe')),
               'set_frame' : self.frame_options()}
        self._call('add_3dgraphics_obj(obj)', obj=obj)

    def render_scene(self, force=True):
        self._call('render_scene(obj)', obj={'force':force})

    def add_text(self, pos, text, fontsize=18, fontface='Arial', sprite_alignment='topLeft'):
        self._call('add_text(obj)',
                   obj={'pos':[json_float(pos[0]), json_float(pos[1]), json_float(pos[2])],'text':str(text),
                        'fontsize':int(fontsize),'fontface':str(fontface), 'sprite_alignment':str(sprite_alignment)})

    def animate(self, fps=None, stop=None, mouseover=True):
        self._call('animate(obj)', obj={'fps':noneint(fps), 'stop':stop, 'mouseover':mouseover})

    def init_done(self):
        self._call('init_done()')

def show_3d_plot_using_threejs(g, **kwds):
    for k in ['spin', 'renderer', 'viewer', 'frame', 'height', 'width', 'background', 'foreground', 'aspect_ratio']:
        extra_kwds = {} if g._extra_kwds is None else g._extra_kwds
        if k in extra_kwds and k not in kwds:
            kwds[k] = g._extra_kwds[k]
    if 'camera_distance' in kwds:
        del kwds['camera_distance'] # deprecated
    t = ThreeJS(**kwds)
    t.add(g, **kwds)
    if kwds.get('spin', False):
        t.animate(mouseover=False)
    t.init_done()

import sage.plot.plot3d.index_face_set
import sage.plot.plot3d.shapes
import sage.plot.plot3d.base
import sage.plot.plot3d.shapes2
from sage.structure.element import Element

def jsonable(x):
    if isinstance(x, Element):
        return json_float(x)
    return x

def graphics3d_to_jsonable(p):
    obj_list = []

    def parse_obj(obj):
        material_name  = ''
        faces = []
        for item in obj.split("\n"):
            tmp = str(item.strip())
            if not tmp:
                continue
            k = tmp.split()
            if k[0] == "usemtl":  # material name
                material_name = k[1]
            elif k[0] == 'f': # face
                v = [int(a) for a in k[1:]]
                faces.append(v)
            # other types are parse elsewhere in a different pass.

        return [{"material_name":material_name, "faces":faces}]

    def parse_texture(p):
        texture_dict = []
        textures = p.texture_set()
        for item in range(0,len(textures)):
            texture_pop = textures.pop()
            string = str(texture_pop)
            item = string.split("(")[1]
            name = item.split(",")[0]
            color = texture_pop.color
            tmp_dict = {"name":name,"color":color}
            texture_dict.append(tmp_dict)

        return texture_dict

    def get_color(name,texture_set):
        for item in range(0,len(texture_set)):
            if(texture_set[item]["name"] == name):
                color = texture_set[item]["color"]
                color_list = [color[0],color[1],color[2]]
                break
            else:
                color_list = []
        return color_list

    def parse_mtl(p):
        mtl = p.mtl_str()
        all_material = []
        for item in mtl.split("\n"):
            if "newmtl" in item:
                tmp = str(item.strip())
                tmp_list = []
                try:
                    texture_set = parse_texture(p)
                    color = get_color(name,texture_set)
                except (ValueError,UnboundLocalError):
                    pass
                try:
                    tmp_list = {"name":name,"ambient":ambient, "specular":specular, "diffuse":diffuse, "illum":illum_list[0],
                               "shininess":shininess_list[0],"opacity":opacity_diffuse[3],"color":color}
                    all_material.append(tmp_list)
                except (ValueError,UnboundLocalError):
                    pass

                ambient = []
                specular = []
                diffuse = []
                illum_list = []
                shininess_list = []
                opacity_list = []
                opacity_diffuse = []
                tmp_list = []
                name = tmp.split()[1]

            if "Ka" in item:
                tmp = str(item.strip())
                for t in tmp.split():
                    try:
                        ambient.append(json_float(t))
                    except ValueError:
                        pass

            if "Ks" in item:
                tmp = str(item.strip())
                for t in tmp.split():
                    try:
                        specular.append(json_float(t))
                    except ValueError:
                        pass

            if "Kd" in item:
                tmp = str(item.strip())
                for t in tmp.split():
                    try:
                        diffuse.append(json_float(t))
                    except ValueError:
                        pass

            if "illum" in item:
                tmp = str(item.strip())
                for t in tmp.split():
                    try:
                        illum_list.append(json_float(t))
                    except ValueError:
                        pass



            if "Ns" in item:
                tmp = str(item.strip())
                for t in tmp.split():
                    try:
                        shininess_list.append(json_float(t))
                    except ValueError:
                        pass

            if "d" in item:
                tmp = str(item.strip())
                for t in tmp.split():
                    try:
                        opacity_diffuse.append(json_float(t))
                    except ValueError:
                        pass

        try:
            color = list(p.all[0].texture.color.rgb())
        except (ValueError, AttributeError):
            pass

        try:
            texture_set = parse_texture(p)
            color = get_color(name,texture_set)
        except (ValueError, AttributeError):
            color = []
            #pass

        tmp_list = {"name":name,"ambient":ambient, "specular":specular, "diffuse":diffuse, "illum":illum_list[0],
                   "shininess":shininess_list[0],"opacity":opacity_diffuse[3],"color":color}
        all_material.append(tmp_list)

        return all_material

    #####################################
    # Conversion functions
    #####################################

    def convert_index_face_set_test(p, T, extra_kwds):
        if T is not None:
            p = p.transform(T=T)
        p.triangulate()
        face_geometry = [{"material_name": p.texture.id, "faces": [[int(v) for v in f] for f in p.index_faces()]}]
        vertex_geometry = [json_float(t) for v in p.vertices() for t in v]
        material = parse_mtl(p)
        myobj = {"face_geometry"   : face_geometry,
                 "type"            : 'index_face_set',
                 "vertex_geometry" : vertex_geometry,
                 "material"        : material}
        for e in ['wireframe', 'mesh']:
            if p._extra_kwds is not None:
                v = p._extra_kwds.get(e, None)
                if v is not None:
                    myobj[e] = jsonable(v)
        obj_list.append(myobj)

    def convert_index_face_set(p, T, extra_kwds):
        if T is not None:
            p = p.transform(T=T)
        face_geometry = parse_obj(p.obj())
        material = parse_mtl(p)
        vertex_geometry = []
        obj  = p.obj()
        for item in obj.split("\n"):
            if "v" in item:
                tmp = str(item.strip())
                for t in tmp.split():
                    try:
                        vertex_geometry.append(json_float(t))
                    except ValueError:
                        pass
        myobj = {"face_geometry"   : face_geometry,
                 "type"            : 'index_face_set',
                 "vertex_geometry" : vertex_geometry,
                 "material"        : material}
        for e in ['wireframe', 'mesh']:
            if p._extra_kwds is not None:
                v = p._extra_kwds.get(e, None)
                if v is not None:
                    myobj[e] = jsonable(v)
        obj_list.append(myobj)

    def convert_text3d(p, T, extra_kwds):
        obj_list.append(
                {"type"          : "text",
                 "text"          : p.string,
                 "pos"           : [0,0,0] if T is None else T([0,0,0]),
                 "color"         : "#" + p.get_texture().hex_rgb(),
                 'fontface'      : str(extra_kwds.get('fontface', 'Arial')),
                 'constant_size' : bool(extra_kwds.get('constant_size', True)),
                 'fontsize'      : int(extra_kwds.get('fontsize', 12))})

    def convert_line(p, T, extra_kwds):
        obj_list.append({"type"       : "line",
                         "points"     : p.points if T is None else [T.transform_point(point) for point in p.points],
                         "thickness"  : jsonable(p.thickness),
                         "color"      : "#" + p.get_texture().hex_rgb(),
                         "arrow_head" : bool(p.arrow_head)})

    def convert_point(p, T, extra_kwds):
        obj_list.append({"type"  : "point",
                         "loc"   : p.loc if T is None else T(p.loc),
                         "size"  : json_float(p.size),
                         "color" : "#" + p.get_texture().hex_rgb()})

    def convert_combination(p, T, extra_kwds):
        for x in p.all:
            handler(x)(x, T, p._extra_kwds)

    def convert_transform_group(p, T, extra_kwds):
        if T is not None:
            T = T * p.get_transformation()
        else:
            T = p.get_transformation()
        for x in p.all:
            handler(x)(x, T, p._extra_kwds)

    def nothing(p, T, extra_kwds):
        pass

    def handler(p):
        if isinstance(p, sage.plot.plot3d.index_face_set.IndexFaceSet):
            return convert_index_face_set
        elif isinstance(p, sage.plot.plot3d.shapes.Text):
            return convert_text3d
        elif isinstance(p, sage.plot.plot3d.base.TransformGroup):
            return convert_transform_group
        elif isinstance(p, sage.plot.plot3d.base.Graphics3dGroup):
            return convert_combination
        elif isinstance(p, sage.plot.plot3d.shapes2.Line):
            return convert_line
        elif isinstance(p, sage.plot.plot3d.shapes2.Point):
            return convert_point
        elif isinstance(p, sage.plot.plot3d.base.PrimitiveObject):
            return convert_index_face_set
        elif isinstance(p, sage.plot.plot3d.base.Graphics3d):
            # this is an empty scene
            return nothing
        else:
            raise NotImplementedError("unhandled type ", type(p))


    # start it going -- this modifies obj_list
    handler(p)(p, None, None)

    # now obj_list is full of the objects
    return obj_list






###
# Interactive 2d Graphics
###

import os, matplotlib.figure

class InteractiveGraphics(object):
    def __init__(self, g, **events):
        self._g = g
        self._events = events

    def figure(self, **kwds):
        if isinstance(self._g, matplotlib.figure.Figure):
            return self._g

        options = dict()
        options.update(self._g.SHOW_OPTIONS)
        options.update(self._g._extra_kwds)
        options.update(kwds)
        options.pop('dpi'); options.pop('transparent'); options.pop('fig_tight')
        fig = self._g.matplotlib(**options)

        from matplotlib.backends.backend_agg import FigureCanvasAgg
        canvas = FigureCanvasAgg(fig)
        fig.set_canvas(canvas)
        fig.tight_layout()  # critical, since sage does this -- if not, coords all wrong
        return fig

    def save(self, filename, **kwds):
        if isinstance(self._g, matplotlib.figure.Figure):
            self._g.savefig(filename)
        else:
            # When fig_tight=True (the default), the margins are very slightly different.
            # I don't know how to properly account for this yet (or even if it is possible),
            # since it only happens at figsize time -- do "a=plot(sin); a.save??".
            # So for interactive graphics, we just set this to false no matter what.
            kwds['fig_tight'] = False
            self._g.save(filename, **kwds)

    def show(self, **kwds):
        fig = self.figure(**kwds)
        ax = fig.axes[0]
        # upper left data coordinates
        xmin, ymax = ax.transData.inverted().transform( fig.transFigure.transform((0,1)) )
        # lower right data coordinates
        xmax, ymin = ax.transData.inverted().transform( fig.transFigure.transform((1,0)) )

        id = '_a' + uuid().replace('-','')

        def to_data_coords(p):
            # 0<=x,y<=1
            return ((xmax-xmin)*p[0] + xmin, (ymax-ymin)*(1-p[1]) + ymin)

        if kwds.get('svg',False):
            filename = '%s.svg'%id
            del kwds['svg']
        else:
            filename = '%s.png'%id

        fig.savefig(filename)

        def f(event, p):
            self._events[event](to_data_coords(p))
        sage_salvus.salvus.namespace[id] = f
        x = {}
        for ev in self._events.keys():
            x[ev] = id

        sage_salvus.salvus.file(filename, show=True, events=x)
        os.unlink(filename)

    def __del__(self):
        for ev in self._events:
            u = self._id+ev
            if u in sage_salvus.salvus.namespace:
                del sage_salvus.salvus.namespace[u]













###
# D3-based interactive 2d Graphics
###

###
# The following is a modified version of graph_plot_js.py from the Sage library, which was
# written by Nathann Cohen in 2013.
###
def graph_to_d3_jsonable(G,
      vertex_labels       = True,
      edge_labels         = False,
      vertex_partition    = [],
      edge_partition      = [],
      force_spring_layout = False,
      charge              = -120,
      link_distance       = 50,
      link_strength       = 1,
      gravity             = .04,
      vertex_size         = 7,
      edge_thickness      = 2,
      width               = None,
      height              = None,
      **ignored):
    r"""
    Display a graph in SageMathCloud using the D3 visualization library.

    INPUT:

    - ``G`` -- the graph

    - ``vertex_labels`` (boolean) -- Whether to display vertex labels (set to
      ``True`` by default).

    - ``edge_labels`` (boolean) -- Whether to display edge labels (set to
      ``False`` by default).

    - ``vertex_partition`` -- a list of lists representing a partition of the
      vertex set. Vertices are then colored in the graph according to the
      partition. Set to ``[]`` by default.

    - ``edge_partition`` -- same as ``vertex_partition``, with edges
      instead. Set to ``[]`` by default.

    - ``force_spring_layout`` -- whether to take sage's position into account if
      there is one (see :meth:`~sage.graphs.generic_graph.GenericGraph.` and
      :meth:`~sage.graphs.generic_graph.GenericGraph.`), or to compute a spring
      layout. Set to ``False`` by default.

    - ``vertex_size`` -- The size of a vertex' circle. Set to `7` by default.

    - ``edge_thickness`` -- Thickness of an edge. Set to ``2`` by default.

    - ``charge`` -- the vertices' charge. Defines how they repulse each
      other. See `<https://github.com/mbostock/d3/wiki/Force-Layout>`_ for more
      information. Set to ``-120`` by default.

    - ``link_distance`` -- See
      `<https://github.com/mbostock/d3/wiki/Force-Layout>`_ for more
      information. Set to ``30`` by default.

    - ``link_strength`` -- See
      `<https://github.com/mbostock/d3/wiki/Force-Layout>`_ for more
      information. Set to ``1.5`` by default.

    - ``gravity`` -- See
      `<https://github.com/mbostock/d3/wiki/Force-Layout>`_ for more
      information. Set to ``0.04`` by default.


    EXAMPLES::

        show(graphs.RandomTree(50), d3=True)

        show(graphs.PetersenGraph(), d3=True, vertex_partition=g.coloring())

        show(graphs.DodecahedralGraph(), d3=True, force_spring_layout=True)

        show(graphs.DodecahedralGraph(), d3=True)

        g = digraphs.DeBruijn(2,2)
        g.allow_multiple_edges(True)
        g.add_edge("10","10","a")
        g.add_edge("10","10","b")
        g.add_edge("10","10","c")
        g.add_edge("10","10","d")
        g.add_edge("01","11","1")
        show(g, d3=True, vertex_labels=True,edge_labels=True,
               link_distance=200,gravity=.05,charge=-500,
               edge_partition=[[("11","12","2"),("21","21","a")]],
               edge_thickness=4)

    """
    directed = G.is_directed()
    multiple_edges = G.has_multiple_edges()

    # Associated an integer to each vertex
    v_to_id = {v: i for i, v in enumerate(G.vertices())}

    # Vertex colors
    color = {i: len(vertex_partition) for i in range(G.order())}
    for i, l in enumerate(vertex_partition):
        for v in l:
            color[v_to_id[v]] = i

    # Vertex list
    nodes = []
    for v in G.vertices():
        nodes.append({"name": str(v), "group": str(color[v_to_id[v]])})

    # Edge colors.
    edge_color_default = "#aaa"
    from sage.plot.colors import rainbow
    color_list = rainbow(len(edge_partition))
    edge_color = {}
    for i, l in enumerate(edge_partition):
        for e in l:
            u, v, label = e if len(e) == 3 else e+(None,)
            edge_color[u, v, label] = color_list[i]
            if not directed:
                edge_color[v, u, label] = color_list[i]

    # Edge list
    edges = []
    seen = {}  # How many times has this edge been seen ?

    for u, v, l in G.edges():

        # Edge color
        color = edge_color.get((u, v, l), edge_color_default)

        # Computes the curve of the edge
        curve = 0

        # Loop ?
        if u == v:
            seen[u, v] = seen.get((u, v), 0)+1
            curve = seen[u, v]*10+10

        # For directed graphs, one also has to take into accounts
        # edges in the opposite direction
        elif directed:
            if G.has_edge(v, u):
                seen[u, v] = seen.get((u, v), 0)+1
                curve = seen[u, v]*15
            else:
                if multiple_edges and len(G.edge_label(u, v)) != 1:
                    # Multiple edges. The first one has curve 15, then
                    # -15, then 30, then -30, ...
                    seen[u, v] = seen.get((u, v), 0) + 1
                    curve = (1 if seen[u, v] % 2 else -1)*(seen[u, v]//2)*15

        elif not directed and multiple_edges:
            # Same formula as above for multiple edges
            if len(G.edge_label(u, v)) != 1:
                seen[u, v] = seen.get((u, v), 0) + 1
                curve = (1 if seen[u, v] % 2 else -1)*(seen[u, v]//2)*15

        # Adding the edge to the list
        edges.append({"source": v_to_id[u],
                      "target": v_to_id[v],
                      "strength": 0,
                      "color": color,
                      "curve": curve,
                      "name": str(l) if edge_labels else ""})

    loops = [e for e in edges if e["source"] == e["target"]]
    edges = [e for e in edges if e["source"] != e["target"]]

    # Defines the vertices' layout if possible
    Gpos = G.get_pos()
    pos = []
    if Gpos is not None and force_spring_layout is False:
        charge = 0
        link_strength = 0
        gravity = 0

        for v in G.vertices():
            x, y = Gpos[v]
            pos.append([json_float(x), json_float(-y)])

    return {"nodes"          : nodes,
            "links"          : edges, "loops": loops, "pos": pos,
            "directed"       : G.is_directed(),
            "charge"         : int(charge),
            "link_distance"  : int(link_distance),
            "link_strength"  : int(link_strength),
            "gravity"        : float(gravity),
            "vertex_labels"  : bool(vertex_labels),
            "edge_labels"    : bool(edge_labels),
            "vertex_size"    : int(vertex_size),
            "edge_thickness" : int(edge_thickness),
            "width"          : json_float(width),
            "height"         : json_float(height) }








