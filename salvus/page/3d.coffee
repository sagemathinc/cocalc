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

{defaults, required} = require('misc')

component_to_hex = (c) ->
    hex = c.toString(16);
    if hex.length == 1
        return "0" + hex
    else
        return hex

rgb_to_hex = (r, g, b) -> "#" + component_to_hex(r) + component_to_hex(g) + component_to_hex(b)

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
        @scene = new THREE.Scene()
        @opts.width  = if opts.width? then opts.width else $(window).width()*.9
        @opts.height = if opts.height? then opts.height else $(window).height()*.6

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
        else
            @opts.element.find(".salvus-3d-viewer-renderer").text("canvas2d")
            @renderer = new THREE.CanvasRenderer(antialias:true)

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

    data_url: (type='png') =>   # 'png' or 'jpeg'
        return @renderer.domElement.toDataURL("image/#{type}")

    set_trackball_controls: () =>
        if @controls?
            return
        #setting up camera controls
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
        ambient = new THREE.AmbientLight( )
        @scene.add( ambient )
        directionalLight = new THREE.DirectionalLight( 0xffffff )
        directionalLight.position.set( 100, 100, 100 ).normalize()
        @scene.add( directionalLight )
        directionalLight = new THREE.DirectionalLight( 0xffffff )
        directionalLight.position.set( -100, -100, -100 ).normalize()
        @scene.add( directionalLight )
        @light = new THREE.PointLight(0xffffff)
        @light.position.set(0,10,0)

    add_text: (opts) =>
        o = defaults opts,
            pos              : [0,0,0]
            text             : required
            fontsize         : 12
            fontface         : 'Arial'
            color            : "#000000"   # anything that is valid to canvas context, e.g., "rgba(249,95,95,0.7)" is also valid.
            border_thickness : 0
            sprite_alignment : 'topLeft'
            constant_size    : true  # if true, then text is automatically resized when the camera moves;
            # WARNING: if constant_size, don't remove text from scene (or if you do, note that it is slightly inefficient still.)

        o.sprite_alignment = THREE.SpriteAlignment[o.sprite_alignment]
        canvas  = document.createElement("canvas")
        context = canvas.getContext("2d")
        context.font = "Normal " + o.fontsize + "px " + o.fontface
        context.fillStyle = o.color
        context.fillText(o.text, o.border_thickness, o.fontsize + o.border_thickness)
        texture = new THREE.Texture(canvas)
        texture.needsUpdate = true
        spriteMaterial = new THREE.SpriteMaterial
            map                  : texture
            useScreenCoordinates : false
            alignment            : o.sprite_alignment,
            sizeAttenuation      : true
        sprite = new THREE.Sprite(spriteMaterial)
        p = o.pos
        sprite.position.set(p[0],p[1],p[2])
        if o.constant_size
            if not @_text?
                @_text = [sprite]
            else
                @_text.push(sprite)
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
        line = new THREE.Line(geometry, new THREE.LineBasicMaterial(color:opts.color, linewidth:o.thickness))
        @scene.add(line)

    add_point: (opts) =>
        o = defaults opts,
            loc  : [0,0,0]
            size : 1
            color: "#000000"
            sizeAttenuation : false
        console.log("rendering a point", o)
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
        for objects in [0..myobj.face_geometry.length-1]
            face3 = myobj.face_geometry[objects].face3
            face4 = myobj.face_geometry[objects].face4
            face5 = myobj.face_geometry[objects].face5
            geometry = new THREE.Geometry()
            geometry.vertices.push(new THREE.Vector3(vertices[i],
            vertices[i+1],vertices[i+2])) for i in [0..(vertices.length-1)] by 3
            geometry.faces.push(new THREE.Face4(face4[k]-1,face4[k+1]-1,face4[k+2]-1,
            face4[k+3]-1)) for k in [0..(face4.length-1)] by 4
            geometry.faces.push(new THREE.Face3(face3[k]-1,face3[k+1]-1,face3[k+2]-1)) for k in [0..(face3.length-1)] by 3
            geometry.faces.push(new THREE.Face4(face5[k]-1,face5[k+1]-1,face5[k+2]-1,
            face5[k+4]-1)) + geometry.faces.push(new THREE.Face4(face5[k]-1,face5[k+1]-1,face5[k+2]-1,
            face5[k+3]-1)) + geometry.faces.push(new THREE.Face4(face5[k]-1,face5[k+1]-1,face5[k+2]-1,
            face5[k+4]-1)) + geometry.faces.push(new THREE.Face4(face5[k]-1,face5[k+2]-1,face5[k+3]-1,
            face5[k+4]-1)) + geometry.faces.push(new THREE.Face4(face5[k+1]-1,face5[k+2]-1,face5[k+3]-1,
            face5[k+4]-1))for k in [0..(face5.length-1)] by 5
            geometry.mergeVertices()
            geometry.computeCentroids()
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

            if opts.wireframe or myobj.wireframe
                if myobj.color
                    color = myobj.color
                else
                    c = myobj.material[mk].color
                    color = "rgb(#{c[0]*255},#{c[1]*255},#{c[2]*255})"
                if typeof myobj.wireframe == 'number'
                    line_width = myobj.wireframe
                else if typeof opts.wireframe == 'number'
                    line_width = opts.wireframe
                else
                    line_width = 1

                material = new THREE.MeshBasicMaterial
                    wireframe          : true
                    color              : color
                    wireframeLinewidth : line_width
            else if not myobj.material[mk]?
                console.log("BUG -- couldn't get material for ", myobj)
                material = new THREE.MeshBasicMaterial
                    wireframe : false
                    color     : "#000000"
            else
                material =  new THREE.MeshPhongMaterial
                    shininess   : "1"
                    ambient     : 0x0ffff
                    wireframe   : false
                    transparent : myobj.material[mk].opacity < 1

                material.color.setRGB(myobj.material[mk].color[0],
                                            myobj.material[mk].color[1],myobj.material[mk].color[2])
                material.ambient.setRGB(myobj.material[mk].ambient[mk],
                                              myobj.material[mk].ambient[1],myobj.material[0].ambient[2])
                material.specular.setRGB(myobj.material[mk].specular[0],
                                               myobj.material[mk].specular[1],myobj.material[mk].specular[2])
                material.opacity = myobj.material[mk].opacity

            mesh = new THREE.Mesh(geometry, material)
            mesh.position.set(0,0,0)
            @scene.add(mesh)

    # always call this after adding things to the scene to make sure track
    # controls are sorted out, etc.   Set draw:false, if you don't want to
    # actually *see* a frame.
    set_frame: (opts) =>
        o = defaults opts,
            xmin : required
            xmax : required
            ymin : required
            ymax : required
            zmin : required
            zmax : required
            color     : @opts.foreground
            thickness : .4
            labels    : true  # whether to draw three numerical labels along each of the x, y, and z axes.
            fontsize  : 14
            draw   : true

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

        if @frame?
            # remove existing frame
            @scene.remove(@frame)
            @frame = undefined

        if o.draw
            geometry = new THREE.CubeGeometry(o.xmax-o.xmin, o.ymax-o.ymin, o.zmax-o.zmin)
            material = new THREE.MeshBasicMaterial
                color              : o.color
                wireframe          : true
                wireframeLinewidth : o.thickness

            # This makes a cube *centered at the origin*, so we have to move it.
            @frame = new THREE.Mesh(geometry, material)
            @frame.position.set(o.xmin + (o.xmax-o.xmin)/2, o.ymin + (o.ymax-o.ymin)/2, o.zmin + (o.zmax-o.zmin)/2)
            @scene.add(@frame)

        if o.labels

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
            mx = (o.xmin+o.xmax)/2
            my = (o.ymin+o.ymax)/2
            mz = (o.zmin+o.zmax)/2
            @_center = new THREE.Vector3(mx,my,mz)

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
            wireframe : false

        for o in opts.obj
            switch o.type
                when 'text'
                    @add_text
                        pos:o.pos
                        text:o.text
                        color:o.color
                        fontsize:o.fontsize
                        fontface:o.fontface
                        constant_size:o.constant_size
                when 'index_face_set'
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
        elt = $(this)
        e = $(".salvus-3d-templates .salvus-3d-viewer").clone()
        elt.empty().append(e)
        opts.element = e
        elt.data('salvus-threejs', new SalvusThreeJS(opts))



