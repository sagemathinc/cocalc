{defaults, required} = require('misc')

class SalvusThreeJS
    constructor: (opts) ->
        @opts = defaults opts,
            element  : required
            width    : undefined
            height   : undefined
            renderer : undefined  # 'webgl', 'canvas2d', or undefined = "webgl if available; otherwise, canvas2d"
            trackball: true
            light    : true

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
            @renderer = new THREE.WebGLRenderer(antialias:true)
        else
            @opts.element.find(".salvus-3d-viewer-renderer").text("canvas2d")
            @renderer = new THREE.CanvasRenderer(antialias:true)

        @renderer.setSize(@opts.width, @opts.height)

        # Placing renderer in the DOM.
        @opts.element.find(".salvus-3d-canvas").append($(@renderer.domElement))

        @add_camera(distance:@opts.camera_distance)

        if @opts.trackball
            setTimeout((()=>@set_trackball_controls()), 1000)

        if @opts.light
            @set_light()

    set_trackball_controls: () =>
        if @controls?
            return
        #setting up camera controls
        @controls = new THREE.TrackballControls(@camera, @renderer.domElement)

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

    set_frame: (opts) =>
        o = defaults opts,
            xmin : required
            xmax : required
            ymin : required
            ymax : required
            zmin : required
            zmax : required
            color : 'grey'
            thickness : .4
            labels    : true  # whether to draw three numerical labels along each of the x, y, and z axes.
            fontsize  : 14

        if @frame?
            # remove existing frame
            @scene.remove(@frame)
        geometry = new THREE.CubeGeometry(o.xmax-o.xmin, o.ymax-o.ymin, o.zmax-o.zmin)
        material = new THREE.MeshBasicMaterial
            wireframe          : true
            color              : o.color
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
                @_frame_labels.push(@add_text(pos:[x,y,z], text:text, fontsize:o.fontsize, constant_size:false))

            offset = 0.075
            e = (o.ymax - o.ymin)*offset
            txt(o.xmax,o.ymin-e,o.zmin, l(o.zmin))
            txt(o.xmax,o.ymin-e,(o.zmin+o.zmax)/2, "z=#{l(o.zmin,o.zmax)}")
            txt(o.xmax,o.ymin-e,o.zmax,l(o.zmax))

            e = (o.xmax - o.xmin)*offset
            txt(o.xmax+e,o.ymin,o.zmin,l(o.ymin))
            txt(o.xmax+e,(o.ymin+o.ymax)/2,o.zmin, "y=#{l(o.ymin,o.ymax)}")
            txt(o.xmax+e,o.ymax,o.zmin,l(o.ymax))

            e = (o.ymax - o.ymin)*offset
            txt(o.xmax,o.ymax+e,o.zmin,l(o.xmax))
            txt((o.xmin+o.xmax)/2,o.ymax+e,o.zmin, "x=#{l(o.xmin,o.xmax)}")
            txt(o.xmin,o.ymax+e,o.zmin,l(o.xmin))

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
        @controls?.update()

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
        if new_pos or force
            s = @camera.position.length() / 3
            if @_text?
                for sprite in @_text
                    sprite.scale.set(s,s,s)
            if @_frame_labels?
                for sprite in @_frame_labels
                    sprite.scale.set(s,s,s)

        @renderer.render(@scene, @camera)

    add_3dgraphics_obj: (opts) =>
        opts = defaults opts,
            obj       : required
            wireframe : false

        create_mesh = (myobj)=>
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
                for item in [0..myobj.material.length-1]
                    if name == myobj.material[item].name
                        mk = item
                        break

                if opts.wireframe or myobj.wireframe
                    c = myobj.material[mk].color
                    material = new THREE.MeshBasicMaterial(wireframe:true, color:"rgb(#{c[0]*255},#{c[1]*255},#{c[2]*255})")
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

        for o in opts.obj
            switch o.id
                when 2
                    @add_text
                        pos:o.pos
                        text:o.text
                        color:o.color
                        fontsize:o.fontsize
                        fontface:o.fontface
                        constant_size:o.constant_size
                when 3
                    create_mesh(o)
                else
                    console.log("ERROR: no renderer for model number = #{o.id}")
                    return
        @render_scene(true)

$.fn.salvus_threejs = (opts={}) ->
    @each () ->
        elt = $(this)
        e = $(".salvus-3d-templates .salvus-3d-viewer").clone()
        elt.empty().append(e)
        opts.element = e
        elt.data('salvus-threejs', new SalvusThreeJS(opts))



