import json
from uuid import uuid4
def uuid():
    return str(uuid4())


#######################################################
# Three.js based plotting
#######################################################

import sage_salvus

def show_3d_plot_using_threejs(p, **kwds):

    #container id to store scene
    id = uuid()
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

        tmp_list = {"material_name":name,"face3":face3,"face4":face4,"face5":face5}
        model.append(tmp_list)

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



    def gs_parametric_plot3d(p):
        id =int(3)
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
        myobj = {"face_geometry":face_geometry,"id":id,"vertex_geometry":vertex_geometry,"material":material}
        obj_list.append(myobj)

    def gs_text3d(p):
        id =int(2)
        text3d_sub_obj = p.all[0]
        text_content = text3d_sub_obj.string

        myobj = {"vertices":[],"faces":[],"normals":[],"colors":[],"text":text_content,"id":id}
        obj_list.append(myobj)



    def gs_combination(p):
        for x in p.all:
            options[str(type(x))](x)


    def gs_inner(p):
        if (str(type(p.all[0]))=="<class 'sage.plot.plot3d.base.TransformGroup'>"):
            gs_parametric_plot3d(p)
        else:
            options[str(type(p.all[0]))](p)


    options = {"<class 'sage.plot.plot3d.base.TransformGroup'>": gs_inner,
               "<type 'sage.plot.plot3d.parametric_surface.ParametricSurface'>": gs_parametric_plot3d,#gs_plot3d,
               "<type 'sage.plot.plot3d.implicit_surface.ImplicitSurface'>":gs_parametric_plot3d,#gs_implicit_plot3d,
               "<class 'sage.plot.plot3d.base.Graphics3dGroup'>": gs_combination,
               "<class 'sage.plot.plot3d.shapes2.Line'>": gs_parametric_plot3d,
               "<type 'sage.plot.plot3d.parametric_surface.ParametricSurface'>":gs_parametric_plot3d,#gs_plot3d,
               "<class 'sage.plot.plot3d.parametric_surface.MobiusStrip'>":gs_parametric_plot3d,#gs_plot3d,
               "<class 'sage.plot.plot3d.shapes.Text'>": gs_text3d,
               "<type 'sage.plot.plot3d.shapes.Sphere'>": gs_parametric_plot3d,
               "<type 'sage.plot.plot3d.index_face_set.IndexFaceSet'>": gs_parametric_plot3d,
               "<class 'sage.plot.plot3d.shapes.Box'>": gs_parametric_plot3d,
               "<type 'sage.plot.plot3d.shapes.Cone'>": gs_parametric_plot3d,
               }


    try:
        options[str(type(p))](p)
    except KeyError:
        return "Type not supported"

    json_obj_list = json.dumps(obj_list, separators=(',', ':'))


    # Create div that will contain our 3d scene
    sage_salvus.html("<div id=%s></div>"%id, hide=False)

    # Display the object

    # TODO: do this right. (for dev it's nice to have tmp.js and ._three_data easily accessible.)
    open("tmp.js",'w').write("window._three_data = %s;"%json_obj_list)
    sage_salvus.load("tmp.js")
    sage_salvus.salvus.javascript("$('#%s').threejs({create:window._three_data})"%id)




###
# Interactive 2d Graphics
###

import os

class InteractiveGraphics(object):
    def __init__(self, g, **events):
        self._g = g
        self._events = events
        fig = g.matplotlib()
        from matplotlib.backends.backend_agg import FigureCanvasAgg
        canvas = FigureCanvasAgg(fig)
        fig.set_canvas(canvas)
        fig.tight_layout()  # critical, since sage does this -- if not, coords all wrong

        ax = fig.axes[0]
        # upper left data coordinates
        self.xmin, self.ymax = ax.transData.inverted().transform( fig.transFigure.transform((0,1)) )
        # lower right data coordinates
        self.xmax, self.ymin = ax.transData.inverted().transform( fig.transFigure.transform((1,0)) )

        self._id = '_a' + uuid().replace('-','')

    def to_data_coords(self, p):
        # 0<=x,y<=1
        return ((self.xmax-self.xmin)*p[0] + self.xmin, (self.ymax-self.ymin)*(1-p[1]) + self.ymin)

    def show(self, **kwds):
        if kwds.get('svg',False):
            filename = '%s.svg'%self._id
        else:
            filename = '%s.png'%self._id
        self._g.save(filename, **kwds)

        def f(event, p):
            self._events[event](self.to_data_coords(p))
        sage_salvus.salvus.namespace[self._id] = f
        x = {}
        for ev in self._events.keys():
            x[ev] = self._id

        sage_salvus.salvus.file(filename, show=True, events=x)
        os.unlink(filename)

    def __del__(self):
        for ev in self._events:
            u = self._id+ev
            if u in sage_salvus.salvus.namespace:
                del sage_salvus.salvus.namespace[u]















