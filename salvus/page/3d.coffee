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
            @add_trackball_controls()

        if @opts.light
            @add_light()

    add_trackball_controls: () =>
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

    add_light: (color= 0xffffff) =>
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
            x        : required
            y        : required
            z        : required
            text     : required
            fontsize : 18
            fontface : 'Arial'
            border_thickness : 4
            sprite_alignment : 'topLeft'

        o.sprite_alignment = THREE.SpriteAlignment[o.sprite_alignment]
        canvas  = document.createElement("canvas")
        context = canvas.getContext("2d")
        context.font = "Normal " + o.fontsize + "px " + o.fontface
        context.fillStyle = "rgba(0, 0, 0, 1.0)"
        context.fillText(o.text, o.border_thickness, o.fontsize + o.border_thickness)
        texture = new THREE.Texture(canvas)
        texture.needsUpdate = true
        spriteMaterial = new THREE.SpriteMaterial
            map                  : texture
            useScreenCoordinates : false
            alignment            : o.sprite_alignment,
            sizeAttenuation      : true
        sprite = new THREE.Sprite(spriteMaterial)
        sprite.position.set(o.x, o.y, o.z)
        if not @_text?
            @_text = [sprite]
        else
            @_text.push(sprite)
        @scene.add(sprite)


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
        if @frame?
            # remove existing frame
            @scene.remove(@frame)
        geometry = new THREE.CubeGeometry(o.xmax-o.xmin, o.ymax-o.ymin, o.zmax-o.zmin)
        material = new THREE.MeshBasicMaterial
            wireframe          : true
            color              : o.color
            wireframeLinewidth : o.thickness

        # This makes a cube *centered at the origin*.
        @frame = new THREE.Mesh(geometry, material)
        @frame.position.set(o.xmin + (o.xmax-o.xmin)/2, o.ymin + (o.ymax-o.ymin)/2, o.zmin + (o.zmax-o.zmin)/2)
        @scene.add(@frame)
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
        if @_text? and new_pos
            s = @camera.position.length() / 3
            for sprite in @_text
                sprite.scale.set(s,s,s)

        @renderer.render(@scene, @camera)

    add_3dgraphics_obj: (opts) =>
        opts = defaults opts,
            obj       : required
            wireframe : false
        #console.log("adding object to scene", obj, typeof obj)

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

                if opts.wireframe
                    material = new THREE.MeshBasicMaterial(wireframe:true, color:'blue') # TODO
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

        makeTextSprite = (message, parameters) =>
            parameters = {}  if parameters is `undefined`
            fontface = (if parameters.hasOwnProperty("fontface") then parameters["fontface"] else "Arial")
            fontsize = (if parameters.hasOwnProperty("fontsize") then parameters["fontsize"] else 18)
            borderThickness = (if parameters.hasOwnProperty("borderThickness") then parameters["borderThickness"] else 4)
            spriteAlignment = THREE.SpriteAlignment.topLeft
            canvas = document.createElement("canvas")
            context = canvas.getContext("2d")
            context.font = "Normal " + fontsize + "px " + fontface
            context.fillStyle = "rgba(0, 0, 0, 1.0)"
            context.fillText message, borderThickness, fontsize + borderThickness
            texture = new THREE.Texture(canvas)
            texture.needsUpdate = true
            spriteMaterial = new THREE.SpriteMaterial(map: texture, useScreenCoordinates: false, alignment: spriteAlignment,sizeAttenuation:0.05)
            sprite = new THREE.Sprite(spriteMaterial)
            sprite.scale.set 10, 10, 1.0
            sprite.position.set Math.floor(Math.random()*20),Math.floor(Math.random()*20),Math.floor(Math.random()*20)
            @scene.add(sprite)

        for o in opts.obj
            switch o.id
                when 2
                    console.log("text defined by", o)
                    makeTextSprite(o.text,
                       { fontsize: 40, fontface: "Arial", borderColor: {r:0,g:0,b:225,a:1.0}})
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



