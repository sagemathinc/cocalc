class SalvusThreeJS
    constructor: (@element) ->
        @scene = new THREE.Scene()

        screen_width  = $(window).width()*.9
        screen_height = $(window).height()*.5

        view_angle = 45
        aspect     = screen_width/screen_height
        near       = 0.1
        far        = 20000
        @camera = new THREE.PerspectiveCamera(view_angle, aspect, near, far)
        @scene.add(@camera)

        @camera.position.set(10,10,10)
        @camera.lookAt(@scene.position)
        @camera.up = new THREE.Vector3(0,0,1)

        # Get renderer and set up camera controls: note that camera
        # functionality is unpredictable if controls are defined before
        # renderer.domElement is placed in container.
        if Detector.webgl
            @element.find(".salvus-3d-viewer-renderer").text("webgl")
            @renderer = new THREE.WebGLRenderer(antialias:true)
        else
            @element.find(".salvus-3d-viewer-renderer").text("canvas2d")
            @renderer = new THREE.CanvasRenderer()

        @renderer.setSize(screen_width, screen_height)

        # Placing renderer in the DOM.
        @element.find(".salvus-3d-canvas").append($(@renderer.domElement))

        #setting up camera controls: note that the camera is not functioning properly
        @controls = new THREE.TrackballControls(@camera, @renderer.domElement)

        ambient = new THREE.AmbientLight( 0xffffff )
        @scene.add( ambient )
        directionalLight = new THREE.DirectionalLight( 0xffffff )
        directionalLight.position.set( 100, 100, 100 ).normalize()
        @scene.add( directionalLight )
        directionalLight = new THREE.DirectionalLight( 0xffffff )
        directionalLight.position.set( -100, -100, -100 ).normalize()
        @scene.add( directionalLight )
        @light = new THREE.PointLight(0xffffff)
        @light.position.set(0,10,0)


    add: (obj) =>
        console.log("adding object to scene", obj, typeof obj)
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


    animate: () =>
        requestAnimationFrame(@animate)
        @controls.update()
        @myrender()

    myrender: () =>
        # renders our scene
        @renderer.render(@scene, @camera)


$.fn.salvus_threejs = () ->
    @each () ->
        elt = $(this)
        e = $(".salvus-3d-templates .salvus-3d-viewer").clone()
        elt.empty().append(e)
        elt.data('salvus-threejs', new SalvusThreeJS(e))



# cb(err, obj)
    # Keep trying to eval code until the result is defined,
    # with exponential backoff, etc.



