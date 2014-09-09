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
###############################################################################


async = require('async')

misc = require('misc')
{defaults, required} = misc

component_to_hex = (c) ->
    hex = c.toString(16);
    if hex.length == 1
        return "0" + hex
    else
        return hex

rgb_to_hex = (r, g, b) -> "#" + component_to_hex(r) + component_to_hex(g) + component_to_hex(b)

_loading_threejs_callbacks = []

#VERSION = '59'
VERSION = '68'
$.ajaxSetup(cache: true) # when using getScript, cache result.

load_threejs = (cb) ->
    _loading_threejs_callbacks.push(cb)
    #console.log("load_threejs")
    if _loading_threejs_callbacks.length > 1
        #console.log("load_threejs: already loading...")
        return

    load = (script, name, cb) ->
        if typeof(name) != 'string'
            cb = name
            name = undefined

        m = (msg) -> #console.log("load('#{script}'): #{msg}")
        m()

        if name? and not window.module?
            window.module = {exports:{}}  # ugly hack around THREE.js now supporting modules

        g = $.getScript(script)
        g.done (script, textStatus) ->
            if name?
                window[name] = window.module.exports
                delete window.module
            # console.log("THREE=", THREE?)
            m("done: #{textStatus}")
            cb()
        g.fail (jqxhr, settings, exception) ->
            m("fail: #{exception}")
            if name?
                delete window.module
            cb("error loading -- #{exception}")

    async.series([
        (cb) -> load("/static/threejs/r#{VERSION}/three.min.js", 'THREE', cb)
        (cb) -> load("/static/threejs/r#{VERSION}/TrackballControls.js", cb)
        (cb) -> load("/static/threejs/r#{VERSION}/Detector.js", cb)
        (cb) ->
            f = () ->
                if THREE?
                    cb()
                else
                    #console.log("load_threejs: waiting for THREEJS...")
                    setTimeout(f, 100)
            f()
    ], (err) ->
        #console.log("load_threejs: done loading")
        for cb in _loading_threejs_callbacks
            cb(err)
        _loading_threejs_callbacks = []
    )

window.load_threejs = load_threejs

class SalvusThreeJS
    constructor: (opts) ->
        @opts = defaults opts,
            element         : required
            width           : undefined
            height          : undefined
            renderer        : undefined  # 'webgl', 'canvas2d', or undefined = "webgl if available; otherwise, canvas2d"
            trackball       : true
            light           : true
            background      : undefined
            foreground      : undefined
            camera_distance : 10

        @init()

    init: () =>
        @scene = new THREE.Scene()

        # IMPORTANT: There is a major bug in three.js -- if you make the width below more than .5 of the window
        # width, then after 8 3d renders, things get foobared in WebGL mode.  This happens even with the simplest
        # demo using the basic cube example from their site with R68.
        if @opts.width
            @opts.width = Math.min(@opts.width, $(window).width()*.5)
        else
            @opts.width  = $(window).width()*.5

        @opts.height = if @opts.height? then @opts.height else $(window).height()*.6

        if not @opts.renderer?
            if Detector.webgl
                @opts.renderer = 'webgl'
            else
                @opts.renderer = 'canvas2d'

        if @opts.renderer == 'webgl'
            @opts.element.find(".salvus-3d-viewer-renderer").text("webgl")
            @renderer = new THREE.WebGLRenderer
                antialias             : true
                preserveDrawingBuffer : true
                alpha                 : true
        else
            @opts.element.find(".salvus-3d-viewer-renderer").text("canvas2d")
            @renderer = new THREE.CanvasRenderer
                antialias : true
                alpha     : true


        @renderer.setClearColor(0xffffff, 1)
        @renderer.setSize(@opts.width, @opts.height)

        if not @opts.background?
            @opts.background = "rgba(0,0,0,0)" # transparent -- looks better with themes
            if not @opts.foreground?
                @opts.foreground = "#000000" # black

        # Placing renderer in the DOM.
        @opts.element.find(".salvus-3d-canvas").css('background':@opts.background).append($(@renderer.domElement))

        if not @opts.foreground?
            c = @opts.element.find(".salvus-3d-canvas").css('background')
            i = c.indexOf(')')
            z = (255-parseInt(a) for a in c.slice(4,i).split(','))
            @opts.foreground = rgb_to_hex(z[0], z[1], z[2])

        @add_camera(distance:@opts.camera_distance)

        if @opts.light
            @set_light()

    show_canvas: () =>
        @opts.element.find(".salvus-3d-canvas").show()
        @opts.element.find(".salvus-3d-note").hide()

    data_url: (type='png') =>   # 'png' or 'jpeg'
        return @renderer.domElement.toDataURL("image/#{type}")

    set_trackball_controls: () =>
        if @controls?
            return
        # set up camera controls
        @controls = new THREE.TrackballControls(@camera, @renderer.domElement)
        if @_center?
            @controls.target = @_center
        @render_scene(true)


    add_camera: (opts) =>
        opts = defaults opts,
            distance : 10

        view_angle = 45
        aspect     = @opts.width/@opts.height
        near       = 0.1
        far        = Math.max(20000, opts.distance*2)

        @camera    = new THREE.PerspectiveCamera(view_angle, aspect, near, far)
        @scene.add(@camera)
        @camera.position.set(opts.distance, opts.distance, opts.distance)
        @camera.lookAt(@scene.position)
        @camera.up = new THREE.Vector3(0,0,1)

    set_light: (color= 0xffffff) =>

        ambient = new THREE.AmbientLight(0x404040)
        @scene.add(ambient)

        color = 0xffffff
        d     = 100  # TODO: scary

        directionalLight = new THREE.DirectionalLight(color)
        directionalLight.position.set(d, d, d).normalize()
        @scene.add(directionalLight)

        directionalLight = new THREE.DirectionalLight(color)
        directionalLight.position.set(-d,-d,-d).normalize()
        @scene.add(directionalLight)

        @light = new THREE.PointLight(color)
        @light.position.set(0,d,0)

    add_text: (opts) =>
        o = defaults opts,
            pos              : [0,0,0]
            text             : required
            fontsize         : 12
            fontface         : 'Arial'
            color            : "#000000"   # anything that is valid to canvas context, e.g., "rgba(249,95,95,0.7)" is also valid.
            constant_size    : true  # if true, then text is automatically resized when the camera moves;
            # WARNING: if constant_size, don't remove text from scene (or if you do, note that it is slightly inefficient still.)

        #console.log("add_text: #{misc.to_json(o)}")

        # make an HTML5 2d canvas on which to draw text
        width   = 300  # this determines max text width; beyond this, text is cut off.
        height  = 150
        canvas  = $("<canvas style='border:1px solid black' width=#{width} height=#{height}>")[0]

        # get the drawing context
        context = canvas.getContext("2d")

        # set the fontsize and fix for our text.
        context.font = "Normal " + o.fontsize + "px " + o.fontface
        context.textAlign = 'center'

        # set the color of our text
        context.fillStyle = o.color

        # actually draw the text -- right in the middle of the canvas.
        context.fillText(o.text, width/2, height/2)

        # Make THREE.js texture from our canvas.
        texture = new THREE.Texture(canvas)
        texture.needsUpdate = true

        # Make a material out of our texture.
        spriteMaterial = new THREE.SpriteMaterial(map: texture)

        # Make the sprite itself.  (A sprite is a 3d plane that always faces the camera.)
        sprite = new THREE.Sprite(spriteMaterial)

        # Move the sprite to its position
        p = o.pos
        sprite.position.set(p[0],p[1],p[2])

        # If the text is supposed to stay constant size, add it to the list of constant size text,
        # which gets resized on scene update.
        if o.constant_size
            if not @_text?
                @_text = [sprite]
            else
                @_text.push(sprite)

        # Finally add the sprite to our scene
        @scene.add(sprite)

        return sprite

    add_line : (opts) =>
        o = defaults opts,
            points     : required
            thickness  : 1
            color      : "#000000"
            arrow_head : false  # TODO
        geometry = new THREE.Geometry()
        for a in o.points
            geometry.vertices.push(new THREE.Vector3(a[0],a[1],a[2]))
        line = new THREE.Line(geometry, new THREE.LineBasicMaterial(color:o.color, linewidth:o.thickness))
        @scene.add(line)

    add_point: (opts) =>
        o = defaults opts,
            loc  : [0,0,0]
            size : 1
            color: "#000000"
            sizeAttenuation : false
        #console.log("rendering a point", o)

        material = new THREE.ParticleBasicMaterial
            color           : o.color
            size            : o.size
            sizeAttenuation : o.sizeAttenuation

        switch @opts.renderer
            when 'webgl'
                geometry = new THREE.Geometry()
                geometry.vertices.push(new THREE.Vector3(o.loc[0], o.loc[1], o.loc[2]))
                particle = new THREE.ParticleSystem(geometry, material)
            when 'canvas2d'
                particle = new THREE.Particle(material)
                particle.position.set(o.loc[0], o.loc[1], o.loc[2])
                if @_frame_params?
                    p = @_frame_params
                    w = Math.min(Math.min(p.xmax-p.xmin, p.ymax-p.ymin),p.zmax-p.zmin)
                else
                    w = 5 # little to go on
                particle.scale.x = particle.scale.y = Math.max(50/@opts.width, o.size * 5 * w / @opts.width)

        @scene.add(particle)

    add_obj: (myobj)=>
        vertices = myobj.vertex_geometry
        for objects in [0...myobj.face_geometry.length]
            #console.log("object=", misc.to_json(myobj))
            face3 = myobj.face_geometry[objects].face3
            face4 = myobj.face_geometry[objects].face4
            face5 = myobj.face_geometry[objects].face5

            geometry = new THREE.Geometry()

            for k in [0...vertices.length] by 3
                geometry.vertices.push(new THREE.Vector3(vertices[k], vertices[k+1], vertices[k+2]))

            # console.log("vertices=",misc.to_json(geometry.vertices))

            push_face3 = (a,b,c) =>
                geometry.faces.push(new THREE.Face3(a-1,b-1,c-1))

            # include all faces defined by 3 vertices (triangles)
            for k in [0...face3.length] by 3
                push_face3(face3[k], face3[k+1], face3[k+2])

            # include all faces defined by 4 vertices (squares), which for THREE.js we must define using two triangles
            push_face4 = (a,b,c,d) =>
                push_face3(a,b,c)
                push_face3(a,c,d)

            for k in [0...face4.length] by 4
                push_face4(face4[k], face4[k+1], face4[k+2], face4[k+3])

            # include all faces defined by 5 vertices (???), which for THREE.js we must define using ten triangles (?)
            for k in [0...face5.length] by 5
                push_face4(face5[k],   face5[k+1], face5[k+2], face5[k+4])
                push_face4(face5[k],   face5[k+1], face5[k+2], face5[k+3])
                push_face4(face5[k],   face5[k+1], face5[k+2], face5[k+4])
                push_face4(face5[k],   face5[k+2], face5[k+3], face5[k+4])
                push_face4(face5[k+1], face5[k+2], face5[k+3], face5[k+4])
           # console.log("faces=",misc.to_json(geometry.faces))

            geometry.mergeVertices()
            #geometry.computeCentroids()
            geometry.computeFaceNormals()
            #geometry.computeVertexNormals()
            geometry.computeBoundingSphere()

            #finding material key(mk)
            name = myobj.face_geometry[objects].material_name
            mk = 0
            for item in [0..myobj.material.length-1]
                if name == myobj.material[item].name
                    mk = item
                    break

            if @opts.wireframe or myobj.wireframe
                if myobj.color
                    color = myobj.color
                else
                    c = myobj.material[mk].color
                    color = "rgb(#{c[0]*255},#{c[1]*255},#{c[2]*255})"
                if typeof myobj.wireframe == 'number'
                    line_width = myobj.wireframe
                else if typeof @opts.wireframe == 'number'
                    line_width = @opts.wireframe
                else
                    line_width = 1

                material = new THREE.MeshBasicMaterial
                    wireframe          : true
                    color              : color
                    wireframeLinewidth : line_width
                    side               : THREE.DoubleSide
            else if not myobj.material[mk]?
                console.log("BUG -- couldn't get material for ", myobj)
                material = new THREE.MeshBasicMaterial
                    wireframe : false
                    color     : "#000000"
            else

                m = myobj.material[mk]

                material =  new THREE.MeshPhongMaterial
                    shininess   : "1"
                    ambient     : 0x0ffff
                    wireframe   : false
                    transparent : m.opacity < 1

                material.color.setRGB(m.color[0],    m.color[1],    m.color[2])
                material.ambient.setRGB(m.ambient[0],  m.ambient[1],  m.ambient[2])
                material.specular.setRGB(m.specular[0], m.specular[1], m.specular[2])
                material.opacity = m.opacity

            mesh = new THREE.Mesh(geometry, material)
            mesh.position.set(0,0,0)
            @scene.add(mesh)

    # always call this after adding things to the scene to make sure track
    # controls are sorted out, etc.   Set draw:false, if you don't want to
    # actually *see* a frame.
    set_frame: (opts) =>
        o = defaults opts,
            xmin      : required
            xmax      : required
            ymin      : required
            ymax      : required
            zmin      : required
            zmax      : required
            color     : @opts.foreground
            thickness : .4
            labels    : true  # whether to draw three numerical labels along each of the x, y, and z axes.
            fontsize  : 14
            draw      : true

        @_frame_params = o
        eps = 0.1
        if Math.abs(o.xmax-o.xmin)<eps
            o.xmax += 1
            o.xmin -= 1
        if Math.abs(o.ymax-o.ymin)<eps
            o.ymax += 1
            o.ymin -= 1
        if Math.abs(o.zmax-o.zmin)<eps
            o.zmax += 1
            o.zmin -= 1

        mx = (o.xmin+o.xmax)/2
        my = (o.ymin+o.ymax)/2
        mz = (o.zmin+o.zmax)/2
        @_center = new THREE.Vector3(mx,my,mz)

        if o.draw
            if @frame?
                # remove existing frame
                for x in @frame
                    @scene.remove(x)
                delete @frame
            @frame = []
            x0 = o.xmin; x1 = o.xmax; y0 = o.ymin; y1 = o.ymax; z0 = o.zmin; z1 = o.zmax
            v = [[[x0,y0,z0], [x1,y0,z0], [x1,y1,z0], [x0,y1,z0], [x0,y0,z0],
                  [x0,y0,z1], [x1,y0,z1], [x1,y1,z1], [x0,y1,z1], [x0,y0,z1]],
                 [[x1,y0,z0], [x1,y0,z1]],
                 [[x0,y1,z0], [x0,y1,z1]],
                 [[x1,y1,z0], [x1,y1,z1]]]
            for points in v
                line = @add_line
                    points    : points
                    color     : o.color
                    thickness : o.thickness
                @frame.push(line)

        if o.draw and o.labels

            if @_frame_labels?
                for x in @_frame_labels
                    @scene.remove(x)

            @_frame_labels = []

            l = (a,b) ->
                if not b?
                    z = a
                else
                    z = (a+b)/2
                z = z.toFixed(2)
                return (z*1).toString()

            txt = (x,y,z,text) =>
                @_frame_labels.push(@add_text(pos:[x,y,z], text:text, fontsize:o.fontsize, color:o.color, constant_size:false))

            offset = 0.075
            if o.draw
                e = (o.ymax - o.ymin)*offset
                txt(o.xmax,o.ymin-e,o.zmin, l(o.zmin))
                txt(o.xmax,o.ymin-e,mz, "z=#{l(o.zmin,o.zmax)}")
                txt(o.xmax,o.ymin-e,o.zmax,l(o.zmax))

                e = (o.xmax - o.xmin)*offset
                txt(o.xmax+e,o.ymin,o.zmin,l(o.ymin))
                txt(o.xmax+e,my,o.zmin, "y=#{l(o.ymin,o.ymax)}")
                txt(o.xmax+e,o.ymax,o.zmin,l(o.ymax))

                e = (o.ymax - o.ymin)*offset
                txt(o.xmax,o.ymax+e,o.zmin,l(o.xmax))
                txt(mx,o.ymax+e,o.zmin, "x=#{l(o.xmin,o.xmax)}")
                txt(o.xmin,o.ymax+e,o.zmin,l(o.xmin))

        v = new THREE.Vector3(mx, my, mz)
        @camera.lookAt(v)
        if @controls?
            @controls.target = @_center
        @render_scene(true)

    add_3dgraphics_obj: (opts) =>
        opts = defaults opts,
            obj       : required
            wireframe : undefined

        for o in opts.obj
            switch o.type
                when 'text'
                    @add_text
                        pos           : o.pos
                        text          : o.text
                        color         : o.color
                        fontsize      : o.fontsize
                        fontface      : o.fontface
                        constant_size : o.constant_size
                when 'index_face_set'
                    if opts.wireframe?
                        o.wireframe = opts.wireframe
                    @add_obj(o)
                    if o.mesh and not o.wireframe  # draw a wireframe mesh on top of the surface we just drew.
                        o.color='#000000'
                        o.wireframe = o.mesh
                        @add_obj(o)
                when 'line'
                    delete o.type
                    @add_line(o)
                when 'point'
                    delete o.type
                    @add_point(o)
                else
                    console.log("ERROR: no renderer for model number = #{o.id}")
                    return
        @render_scene(true)

    animate: (opts={}) =>
        opts = defaults opts,
            fps  : undefined
            stop : false
            mouseover : true
        #console.log('anim', @opts.element.length, @opts.element.is(":visible"))

        @show_canvas()

        if not @opts.element.is(":visible")
            # check again after a delay
            setTimeout((() => @animate(opts)), 1500)
            return

        if opts.stop
            @_stop_animating = true
            # so next time around will start
            return
        if @_stop_animating
            @_stop_animating = false
            return
        f = () =>
            requestAnimationFrame((()=>@animate(opts)))
        if opts.fps? and opts.fps
            setTimeout(f , 1000/opts.fps)
        else
            f()
        if opts.mouseover and (not document.hasFocus() or not @opts.element.is(":hover"))
            return
        @render_scene()

    render_scene: (force=false) =>
        #console.log('render', @opts.element.length)
        @show_canvas()

        if @controls?
            @controls?.update()
        else
            if @opts.trackball
                @set_trackball_controls()

        pos = @camera.position
        if not @_last_pos?
            new_pos = true
            @_last_pos = pos.clone()
        else if @_last_pos.distanceToSquared(pos) > .05
            new_pos = true
            @_last_pos.copy(pos)
        else
            new_pos = false

        if not new_pos and not force
            return

        # rescale all text in scene
        if (new_pos or force) and @_center?
            s = @camera.position.distanceTo(@_center) / 3
            if @_text?
                for sprite in @_text
                    sprite.scale.set(s,s,s)
            if @_frame_labels?
                for sprite in @_frame_labels
                    sprite.scale.set(s,s,s)

        @renderer.render(@scene, @camera)

$.fn.salvus_threejs = (opts={}) ->
    @each () ->
        # console.log("applying official .salvus_threejs plugin")
        elt = $(this)
        e = $(".salvus-3d-templates .salvus-3d-viewer").clone()
        elt.empty().append(e)
        e.find(".salvus-3d-canvas").hide()
        opts.element = e
        f = () -> elt.data('salvus-threejs', new SalvusThreeJS(opts))
        if not THREE?
            load_threejs (err) =>
                if not err
                    f()
                else
                    # TODO -- not sure what to do at this point...
                    console.log("Error loading THREE.js")
        else
            f()

