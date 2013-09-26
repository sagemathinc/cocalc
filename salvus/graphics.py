###############################################################################
# Copyright (c) 2013, William Stein
# All rights reserved.
#
# Redistribution and use in source and binary forms, with or without
# modification, are permitted provided that the following conditions are met:
#
# 1. Redistributions of source code must retain the above copyright notice, this
#    list of conditions and the following disclaimer.
# 2. Redistributions in binary form must reproduce the above copyright notice,
#    this list of conditions and the following disclaimer in the documentation
#    and/or other materials provided with the distribution.
#
# THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND
# ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
# WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
# DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT OWNER OR CONTRIBUTORS BE LIABLE FOR
# ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES
# (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES;
# LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND
# ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
# (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS
# SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
#
# The views and conclusions contained in the software and documentation are those
# of the authors and should not be interpreted as representing official policies,
# either expressed or implied, of the FreeBSD Project.
###############################################################################



import json
from uuid import uuid4
def uuid():
    return str(uuid4())
import sage_salvus


#######################################################
# Three.js based plotting
#######################################################

noneint = lambda n : n if n is None else int(n)

class ThreeJS(object):
    def __init__(self, renderer=None, width=None, height=None,
                 frame=True, camera_distance=10.0, background=None, foreground=None, **ignored):
        """
        INPUT:

        - renderer -- None (automatic), 'canvas2d', or 'webgl'
        - width    -- None (automatic) or an integer
        - height   -- None (automatic) or an integer
        - frame    -- bool (default: True); draw a frame that includes every object.
        - camera_distance -- float (default: 10); default camera distance.
        - background -- None (transparent); otherwise a color such as 'black' or 'white'
        - foreground -- None (automatic = black if transparent; otherwise opposite of background);
           or a color; this is used for drawing the frame and axes labels.
        """
        self._frame    = frame
        self._salvus   = sage_salvus.salvus  # object for this cell
        self._id       = uuid()
        self._selector = "$('#%s')"%self._id
        self._obj      = "%s.data('salvus-threejs')"%self._selector
        self._salvus.html("<div id=%s style='border:1px solid grey'></div>"%self._id)
        self._salvus.javascript("%s.salvus_threejs(obj)"%self._selector, once=False,
                                obj={'renderer':renderer,
                                     'width':noneint(width),
                                     'height':noneint(height),
                                     'camera_distance':float(camera_distance),
                                     'background':background,
                                     'foreground':foreground
                                     })
        self._graphics = []

    def _call(self, s, obj=None):
        cmd = 'misc.eval_until_defined({code:"%s", cb:(function(err, __t__) { __t__ != null ? __t__.%s:void 0 })})'%(
                self._obj, s)
        self._salvus.execute_javascript(cmd, obj=obj)

    def add(self, graphics3d, **kwds):
        kwds = graphics3d._process_viewing_options(kwds)
        self._frame = kwds.get('frame',False)
        self._graphics.append(graphics3d)
        self._call('add_3dgraphics_obj(obj)', obj={'obj':graphics3d_to_jsonable(graphics3d), 'wireframe':jsonable(kwds.get('wireframe'))})
        self.set_frame(draw = self._frame)  # update the frame

    def render_scene(self, force=True):
        self._call('render_scene(obj)', obj={'force':force})

    def add_text(self, pos, text, fontsize=18, fontface='Arial', sprite_alignment='topLeft'):
        self._call('add_text(obj)',
                   obj={'pos':[float(pos[0]), float(pos[1]), float(pos[2])],'text':str(text),
                        'fontsize':int(fontsize),'fontface':str(fontface), 'sprite_alignment':str(sprite_alignment)})

    def animate(self, fps=None, stop=None, mouseover=True):
        self._call('animate(obj)', obj={'fps':noneint(fps), 'stop':stop, 'mouseover':mouseover})

    def set_frame(self, xmin=None, xmax=None, ymin=None, ymax=None, zmin=None, zmax=None, color=None, draw=True):
        if not self._graphics:
            xmin, xmax, ymin, ymax, zmin, zmax = -1,1,-1,1,-1,1
        else:
            b = self._graphics[0].bounding_box()
            xmin, xmax, ymin, ymax, zmin, zmax = b[0][0], b[1][0], b[0][1], b[1][1], b[0][2], b[1][2]
            for g in self._graphics[1:]:
                b = g.bounding_box()
                xmin, xmax, ymin, ymax, zmin, zmax = (
                      min(xmin,b[0][0]), max(b[1][0],xmax),
                      min(b[0][1],ymin), max(b[1][1],ymax),
                      min(b[0][2],zmin), max(b[1][2],zmax))

        self._call('set_frame(obj)', obj={
                      'xmin':float(xmin), 'xmax':float(xmax),
                      'ymin':float(ymin), 'ymax':float(ymax),
                      'zmin':float(zmin), 'zmax':float(zmax), 'color':color, 'draw':draw})

def show_3d_plot_using_threejs(g, **kwds):
    b = g.bounding_box()
    if 'camera_distance' not in kwds:
        kwds['camera_distance'] = 2 * max([abs(x) for x in list(b[0])+list(b[1])])
    t = ThreeJS(**kwds)
    t.set_frame(b[0][0],b[1][0],b[0][1],b[1][1],b[0][2],b[1][2],draw=False)
    t.add(g, **kwds)
    t.animate()
    return t

import sage.plot.plot3d.index_face_set
import sage.plot.plot3d.shapes
import sage.plot.plot3d.base
import sage.plot.plot3d.shapes2
from sage.structure.element import Element

def jsonable(x):
    if isinstance(x, Element):
        return float(x)
    return x

def graphics3d_to_jsonable(p):

    obj_list = []

    def parse_obj(obj):
        model = []
        for item in obj.split("\n"):
            if "usemtl" in item:
                tmp = str(item.strip())
                tmp_list = {}
                try:
                    tmp_list = {"material_name":name,"face3":face3,"face4":face4,"face5":face5}
                    model.append(tmp_list)
                except (ValueError,UnboundLocalError):
                    pass
                face3 = []
                face4 = []
                face5 = []
                tmp_list = []
                name = tmp.split()[1]


            if "f" in item:
                tmp = str(item.strip())
                face_num = len(tmp.split())
                for t in tmp.split():
                    if(face_num ==4):
                        try:
                            face3.append(int(t))
                        except ValueError:
                            pass

                    elif(face_num ==6):
                        try:
                            face5.append(int(t))
                        except ValueError:
                            pass
                    else:
                        try:
                            face4.append(int(t))
                        except ValueError:
                            pass

        model.append({"material_name":name,"face3":face3,"face4":face4,"face5":face5})

        return model


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
                        ambient.append(float(t))
                    except ValueError:
                        pass

            if "Ks" in item:
                tmp = str(item.strip())
                for t in tmp.split():
                    try:
                        specular.append(float(t))
                    except ValueError:
                        pass

            if "Kd" in item:
                tmp = str(item.strip())
                for t in tmp.split():
                    try:
                        diffuse.append(float(t))
                    except ValueError:
                        pass

            if "illum" in item:
                tmp = str(item.strip())
                for t in tmp.split():
                    try:
                        illum_list.append(float(t))
                    except ValueError:
                        pass



            if "Ns" in item:
                tmp = str(item.strip())
                for t in tmp.split():
                    try:
                        shininess_list.append(float(t))
                    except ValueError:
                        pass

            if "d" in item:
                tmp = str(item.strip())
                for t in tmp.split():
                    try:
                        opacity_diffuse.append(float(t))
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

    def convert_index_face_set(p):
        face_geometry = parse_obj(p.obj())
        material = parse_mtl(p)
        vertex_geometry = []
        obj  = p.obj()
        for item in obj.split("\n"):
            if "v" in item:
                tmp = str(item.strip())
                for t in tmp.split():
                    try:
                        vertex_geometry.append(float(t))
                    except ValueError:
                        pass
        myobj = {"face_geometry":face_geometry,"type":'index_face_set',"vertex_geometry":vertex_geometry,"material":material}
        for e in ['wireframe', 'mesh']:
            if p._extra_kwds is not None:
                v = p._extra_kwds.get(e, None)
                if v is not None:
                    myobj[e] = jsonable(v)
        obj_list.append(myobj)

    def convert_text3d(p):
        text3d_sub_obj = p.all[0]
        text_content = text3d_sub_obj.string
        color = "#" + text3d_sub_obj.get_texture().hex_rgb()

        # support for extra options not supported in sage
        extra_opts = p._extra_kwds
        fontsize = int(extra_opts.get('fontsize', 12))
        fontface = str(extra_opts.get('fontface', 'Arial'))
        constant_size = bool(extra_opts.get('constant_size', True))

        myobj = {"type":"text",
                 "text":text_content,
                 "pos":list(p.bounding_box()[0]),
                 "color":color,
                 'fontface':fontface,
                 'constant_size':constant_size,
                 'fontsize':fontsize}
        obj_list.append(myobj)

    def convert_line(p):
        obj_list.append({"type"       : "line",
                         "points"     : p.points,
                         "thickness"  : jsonable(p.thickness),
                         "color"      : "#" + p.get_texture().hex_rgb(),
                         "arrow_head" : bool(p.arrow_head)})

    def convert_point(p):
        obj_list.append({"type" : "point",
                         "loc"  : p.loc,
                         "size" : float(p.size),
                         "color" : "#" + p.get_texture().hex_rgb()})

    def convert_combination(p):
        for x in p.all:
            handler(x)(x)

    def convert_inner(p):
        if isinstance(p.all[0], sage.plot.plot3d.base.TransformGroup):
            convert_index_face_set(p)
        else:
            handler(p.all[0])(p)


    def handler(p):
        if isinstance(p, sage.plot.plot3d.index_face_set.IndexFaceSet):
            return convert_index_face_set
        elif isinstance(p, sage.plot.plot3d.shapes.Text):
            return convert_text3d
        elif isinstance(p, sage.plot.plot3d.base.TransformGroup):
            return convert_inner
        elif isinstance(p, sage.plot.plot3d.base.Graphics3dGroup):
            return convert_combination
        elif isinstance(p, sage.plot.plot3d.shapes2.Line):
            return convert_line
        elif isinstance(p, sage.plot.plot3d.shapes2.Point):
            return convert_point
        elif isinstance(p, sage.plot.plot3d.base.PrimitiveObject):
            return convert_index_face_set
        else:
            raise NotImplementedError("unhandled type ", type(p))


    handler(p)(p)

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















