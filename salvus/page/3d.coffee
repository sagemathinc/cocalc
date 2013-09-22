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
            @renderer = new THREE.CanvasRenderer()

        @renderer.setSize(@opts.width, @opts.height)

        # Placing renderer in the DOM.
        @opts.element.find(".salvus-3d-canvas").append($(@renderer.domElement))

        @opts.element.mouseenter () => @_mouse_over = true
        @opts.element.mouseleave () => @_mouse_over = false

        @add_camera()

        if @opts.trackball
            @add_trackball_controls()

        if @opts.light
            @add_light()

    add_trackball_controls: () =>
        if @controls?
            return
        #setting up camera controls
        @controls = new THREE.TrackballControls(@camera, @renderer.domElement)

    add_camera: () =>
        view_angle = 45
        aspect     = @opts.width/@opts.height
        near       = 0.1
        far        = 20000

        @camera    = new THREE.PerspectiveCamera(view_angle, aspect, near, far)
        @scene.add(@camera)
        @camera.position.set(10,10,10)
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

    animate: (opts={}) =>
        opts = defaults opts,
            fps  : undefined
            stop : false
            mouseover : true
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
        if opts.mouseover and not @_mouse_over
            return
        @render_scene()

    render_scene: () =>
        @controls?.update()
        @renderer.render(@scene, @camera)

    add_3dgraphics_obj: (obj) =>
        #console.log("adding object to scene", obj, typeof obj)
        window.obj = obj

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

                colorMaterial =  new THREE.MeshPhongMaterial
                    shininess   : "1"
                    ambient     : 0x0ffff
                    wireframe   : false
                    transparent : true

                colorMaterial.color.setRGB(myobj.material[mk].color[0],
                                            myobj.material[mk].color[1],myobj.material[mk].color[2])
                colorMaterial.ambient.setRGB(myobj.material[mk].ambient[mk],
                                              myobj.material[mk].ambient[1],myobj.material[0].ambient[2])
                colorMaterial.specular.setRGB(myobj.material[mk].specular[0],
                                               myobj.material[mk].specular[1],myobj.material[mk].specular[2])
                colorMaterial.opacity = myobj.material[mk].opacity

                mesh = new THREE.Mesh(geometry, colorMaterial )
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
            true

        for o in obj
            switch o.id
                when 2
                    makeTextSprite(o.text,
                       { fontsize: 40, fontface: "Arial", borderColor: {r:0,g:0,b:225,a:1.0}})
                when 3
                    create_mesh(o)
                else
                    console.log("ERROR: no renderer for model number = #{o.id}")
                    return
            @render_scene()

$.fn.salvus_threejs = (opts={}) ->
    @each () ->
        elt = $(this)
        e = $(".salvus-3d-templates .salvus-3d-viewer").clone()
        elt.empty().append(e)
        opts.element = e
        elt.data('salvus-threejs', new SalvusThreeJS(opts))



