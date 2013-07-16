class ThreeJSobj
    constructor : (@url, @elt, @mtl) ->
        # Spawns the objects, scenes, cameras, renderers etc.
        # set the scene

        # TODO: the @mtl material is not used at all yet.
        # console.log(@mtl)


        width = $(window).width()
        height = ($(window).height()/3) * 2
        @renderer = new THREE.WebGLRenderer(antialias: true)

        @renderer.setSize(width, height)
        @scene = new THREE.Scene()
        @camera = new THREE.PerspectiveCamera(45, width / height, 2, 1000)
        @camera.position = new THREE.Vector3(10, 10, 10)
        @scene.add(@camera)
        @controls = new THREE.TrackballControls(@camera, @renderer.domElement)
        @controls.target.set(0, 0, 0)

        loader = new THREE.OBJLoader()
        loader.load @url, (object) =>
            for myobj in object.children
                mat1  = new THREE.MeshBasicMaterial(color: 0x6666ff)
                mat2  = new THREE.MeshBasicMaterial
                            color: 0x000000
                            wireframe: true
                            transparent: true
                            opacity: 0.5
                mesh  = new THREE.SceneUtils.createMultiMaterialObject(myobj.geometry, [mat1, mat2])
                @scene.add(mesh)

        # add the renderer to the document
        $(@elt).empty().append(@renderer.domElement)
        @animate()

    animate: () =>
        # one animation tick
        requestAnimationFrame(@animate)
        @controls.update()
        @myrender()

    myrender: () =>
        # renders our scene
        @renderer.render(@scene, @camera)

exports.ThreeJSobj = ThreeJSobj