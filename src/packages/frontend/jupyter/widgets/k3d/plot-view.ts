import { K3D, ThreeJsProvider } from "k3d/dist/standalone";
import { DOMWidgetView } from "@jupyter-widgets/base";
import { chunks, objects, plots } from "./state";
import { pull, difference } from "lodash";

export default class PlotView extends DOMWidgetView {
  private K3DInstance: K3D;
  private container: HTMLDivElement;
  private renderPromises: Promise<any>[];
  private cameraChangeId: number;
  private GUIObjectChanges: number;
  private GUIParametersChanges: number;
  private voxelsCallback: number;
  private objectHoverCallback: number;
  private objectClickCallback: number;
  private listeners: { [name: string]: Function } = {};

  render() {
    const containerEnvelope = window.document.createElement("div");
    const container = window.document.createElement("div");

    containerEnvelope.style.cssText = [
      `height:${this.model.get("height")}px`,
      "position: relative",
    ].join(";");

    container.style.cssText = [
      "width: 100%",
      "height: 100%",
      "position: relative",
    ].join(";");

    containerEnvelope.appendChild(container);
    this.el.appendChild(containerEnvelope);

    this.container = container;
    this.on("displayed", this._init, this);
  }

  remove() {
    //console.log(this.debugid, "PlotView - remove", this.model.model_id);
    pull(plots, this);
    this.K3DInstance.off(
      this.K3DInstance.events.CAMERA_CHANGE,
      this.cameraChangeId
    );
    this.K3DInstance.off(
      this.K3DInstance.events.OBJECT_CHANGE,
      this.GUIObjectChanges
    );
    this.K3DInstance.off(
      this.K3DInstance.events.PARAMETERS_CHANGE,
      this.GUIParametersChanges
    );
    this.K3DInstance.off(
      this.K3DInstance.events.VOXELS_CALLBACK,
      this.voxelsCallback
    );
    this.K3DInstance.off(
      this.K3DInstance.events.OBJECT_HOVERED,
      this.objectHoverCallback
    );
    this.K3DInstance.off(
      this.K3DInstance.events.OBJECT_CLICKED,
      this.objectClickCallback
    );

    // Disable all listeners.  This is not done in upstream, which seems to be a mistake.
    for (const name in this.listeners) {
      this.model.off(name, this.listeners[name], this);
    }
  }

  _init() {
    //this.debugid = Math.random();
    //console.log(this.debugid, "PlotView - init", this.model.model_id);
    const self = this;
    this.renderPromises = [];
    plots.push(this);

    // a little abuse, since it is useful:
    (this.model as any).lastCameraSync = new Date().getTime();

    this.model.on(
      "msg:custom",
      (obj) => {
        const { model } = this;

        if (obj.msg_type === "fetch_screenshot") {
          this.K3DInstance.getScreenshot(
            this.K3DInstance.parameters.screenshotScale,
            obj.only_canvas
          ).then((canvas) => {
            const data = canvas.toDataURL().split(",")[1];
            // TODO: upstream had {patch:true}, which typescript and
            // upstreams docs for Backbone says is invalid.  This was
            // added mysteriously in this commit:
            //   https://github.com/K3D-tools/K3D-jupyter/commit/a270d11a7a3e8bebef6a58fb91d7a64a472442ff
            // @ts-ignore
            model.save("screenshot", data, { patch: true });
          });
        }

        if (obj.msg_type === "fetch_snapshot") {
          // @ts-ignore -- see comment about {patch:true} elsewhere.
          model.save(
            "snapshot",
            this.K3DInstance.getHTMLSnapshot(obj.compression_level),
            // @ts-ignore
            { patch: true }
          );
        }

        if (obj.msg_type === "start_auto_play") {
          this.K3DInstance.startAutoPlay();
        }

        if (obj.msg_type === "stop_auto_play") {
          this.K3DInstance.stopAutoPlay();
        }

        if (obj.msg_type === "reset_camera") {
          this.K3DInstance.resetCamera(obj.factor);
        }

        if (obj.msg_type === "render") {
          if (self.renderPromises.length === 0) {
            self.K3DInstance.refreshAfterObjectsChange(false, true);
          } else {
            Promise.all(self.renderPromises).then((values) => {
              self.K3DInstance.refreshAfterObjectsChange(false, true);

              if (values.length === self.renderPromises.length) {
                self.renderPromises = [];
              }
            });
          }
        }
      },
      this
    );

    try {
      this.K3DInstance = new K3D(ThreeJsProvider, this.container, {
        antialias: this.model.get("antialias"),
        logarithmicDepthBuffer: this.model.get("logarithmic_depth_buffer"),
        lighting: this.model.get("lighting"),
        cameraMode: this.model.get("camera_mode"),
        snapshotType: this.model.get("snapshot_type"),
        backendVersion: this.model.get("_backend_version"),
        screenshotScale: this.model.get("screenshot_scale"),
        menuVisibility: this.model.get("menu_visibility"),
        cameraNoRotate: this.model.get("camera_no_rotate"),
        cameraNoZoom: this.model.get("camera_no_zoom"),
        cameraNoPan: this.model.get("camera_no_pan"),
        cameraRotateSpeed: this.model.get("camera_rotate_speed"),
        cameraZoomSpeed: this.model.get("camera_zoom_speed"),
        cameraPanSpeed: this.model.get("camera_pan_speed"),
        cameraDampingFactor: this.model.get("camera_damping_factor"),
        cameraFov: this.model.get("camera_fov"),
        colorbarObjectId: this.model.get("colorbar_object_id"),
        cameraAnimation: this.model.get("camera_animation"),
        name: this.model.get("name"),
        axes: this.model.get("axes"),
        axesHelper: this.model.get("axes_helper"),
        grid: this.model.get("grid"),
        fps: this.model.get("fps"),
        autoRendering: this.model.get("auto_rendering"),
        gridVisible: this.model.get("grid_visible"),
        gridColor: this.model.get("grid_color"),
        clippingPlanes: this.model.get("clipping_planes"),
        labelColor: this.model.get("label_color"),
      });

      if (this.model.get("camera_auto_fit") === false) {
        this.K3DInstance.setCamera(this.model.get("camera"));
      }
    } catch (err) {
      console.log(`WARNING: Issue creating K3DInstance -- ${err}`);
      return;
    }

    // IMPORTANT!  Upstream only creating listeners, and never removed them.
    // This maybe doesn't matter as much in JupyterLab
    // where there is no colaboration/virtualization/etc., but in CoCalc it is
    // a disaster.  Hence restructuring the code to ensure everything is
    // removed by the remove method as well.  Also, we only add these listeners
    // after successfully creating the K3DInstance above, since they would only
    // potentially cause trouble when something goes wrong.
    this.listeners = {
      "change:camera_auto_fit": this._setCameraAutoFit,
      "change:lighting": this._setDirectionalLightingIntensity,
      "change:time": this._setTime,
      "change:grid_auto_fit": this._setGridAutoFit,
      "change:grid_visible": this._setGridVisible,
      "change:grid_color": this._setGridColor,
      "change:label_color": this._setLabelColor,
      "change:fps_meter": this._setFpsMeter,
      "change:fps": this._setFps,
      "change:screenshot_scale": this._setScreenshotScale,
      "change:voxel_paint_color": this._setVoxelPaintColor,
      "change:background_color": this._setBackgroundColor,
      "change:grid": this._setGrid,
      "change:auto_rendering": this._setAutoRendering,
      "change:camera": this._setCamera,
      "change:camera_animation": this._setCameraAnimation,
      "change:clipping_planes": this._setClippingPlanes,
      "change:object_ids": this._onObjectsListChange,
      "change:menu_visibility": this._setMenuVisibility,
      "change:colorbar_object_id": this._setColorMapLegend,
      "change:colorbar_scientific": this._setColorbarScientific,
      "change:rendering_steps": this._setRenderingSteps,
      "change:axes": this._setAxes,
      "change:camera_no_rotate": this._setCameraLock,
      "change:camera_no_zoom": this._setCameraLock,
      "change:camera_no_pan": this._setCameraLock,
      "change:camera_rotate_speed": this._setCameraSpeeds,
      "change:camera_zoom_speed": this._setCameraSpeeds,
      "change:camera_pan_speed": this._setCameraSpeeds,
      "change:camera_fov": this._setCameraFOV,
      "change:camera_damping_factor": this._setCameraDampingFactor,
      "change:axes_helper": this._setAxesHelper,
      "change:snapshot_type": this._setSnapshotType,
      "change:name": this._setName,
      "change:mode": this._setViewMode,
      "change:camera_mode": this._setCameraMode,
      "change:manipulate_mode": this._setManipulateMode,
    };
    for (const name in this.listeners) {
      this.model.on(name, this.listeners[name], this);
    }

    this.K3DInstance.setClearColor(this.model.get("background_color"));
    this.K3DInstance.setChunkList(chunks);

    this._setCameraAutoFit();
    this._setGridAutoFit();
    this._setMenuVisibility();
    this._setVoxelPaintColor();

    this.model.get("object_ids").forEach((id) => {
      this.renderPromises.push(
        this.K3DInstance.load({
          objects: [objects[id].attributes],
        })
      );
    }, this);

    this.cameraChangeId = this.K3DInstance.on(
      this.K3DInstance.events.CAMERA_CHANGE,
      (control) => {
        // @ts-ignore: this _comm_live is private
        if (self.model._comm_live) {
          if (new Date().getTime() - (self.model as any).lastCameraSync > 200) {
            (self.model as any).lastCameraSync = new Date().getTime();
            // @ts-ignore -- see comment about {patch:true} elsewhere.
            self.model.save("camera", control, { patch: true });
          }
        }
      }
    );

    this.GUIObjectChanges = this.K3DInstance.on(
      this.K3DInstance.events.OBJECT_CHANGE,
      (change) => {
        // @ts-ignore: _comm_live is private
        if (self.model._comm_live) {
          if (change.value.data && change.value.shape) {
            change.value.compression_level =
              objects[change.id].attributes.compression_level;
          }

          if (objects[change.id]) {
            objects[change.id].save(change.key, change.value, {
              patch: true,
            });
          }
        }
      }
    );

    this.GUIParametersChanges = this.K3DInstance.on(
      this.K3DInstance.events.PARAMETERS_CHANGE,
      (change) => {
        // @ts-ignore -- see comment about {patch:true} elsewhere.
        self.model.save(change.key, change.value, { patch: true });
      }
    );

    this.voxelsCallback = this.K3DInstance.on(
      this.K3DInstance.events.VOXELS_CALLBACK,
      (param) => {
        if (objects[param.object.K3DIdentifier]) {
          objects[param.object.K3DIdentifier].send({
            msg_type: "click_callback",
            coord: param.coord,
          });
        }
      }
    );

    this.objectHoverCallback = this.K3DInstance.on(
      this.K3DInstance.events.OBJECT_HOVERED,
      (param) => {
        if (objects[param.object.K3DIdentifier]) {
          objects[param.object.K3DIdentifier].send({
            msg_type: "hover_callback",
            position: param.point.toArray(),
            normal: param.face.normal.toArray(),
            distance: param.distance,
            face_index: param.faceIndex,
            face: [param.face.a, param.face.b, param.face.c],
            uv: param.uv,
          });
        }
      }
    );

    this.objectClickCallback = this.K3DInstance.on(
      this.K3DInstance.events.OBJECT_CLICKED,
      (param) => {
        if (objects[param.object.K3DIdentifier]) {
          objects[param.object.K3DIdentifier].send({
            msg_type: "click_callback",
            position: param.point.toArray(),
            normal: param.face.normal.toArray(),
            distance: param.distance,
            face_index: param.faceIndex,
            face: [param.face.a, param.face.b, param.face.c],
            uv: param.uv,
          });
        }
      }
    );
  }

  _setDirectionalLightingIntensity() {
    this.K3DInstance.setDirectionalLightingIntensity(
      this.model.get("lighting")
    );
  }

  _setTime() {
    if (this.K3DInstance.parameters.time !== this.model.get("time")) {
      this.renderPromises.push(
        this.K3DInstance.setTime(this.model.get("time"))
      );
    }
  }

  _setCameraAutoFit() {
    this.K3DInstance.setCameraAutoFit(this.model.get("camera_auto_fit"));
  }

  _setGridAutoFit() {
    this.K3DInstance.setGridAutoFit(this.model.get("grid_auto_fit"));
  }

  _setGridVisible() {
    this.K3DInstance.setGridVisible(this.model.get("grid_visible"));
  }

  _setGridColor() {
    this.K3DInstance.setGridColor(this.model.get("grid_color"));
  }

  _setLabelColor() {
    this.K3DInstance.setLabelColor(this.model.get("label_color"));
  }

  _setFps() {
    this.K3DInstance.setFps(this.model.get("fps"));
  }

  _setFpsMeter() {
    this.K3DInstance.setFpsMeter(this.model.get("fps_meter"));
  }

  _setScreenshotScale() {
    this.K3DInstance.setScreenshotScale(this.model.get("screenshot_scale"));
  }

  _setVoxelPaintColor() {
    this.K3DInstance.setVoxelPaint(this.model.get("voxel_paint_color"));
  }

  _setBackgroundColor() {
    this.K3DInstance.setClearColor(this.model.get("background_color"));
  }

  _setGrid() {
    this.K3DInstance.setGrid(this.model.get("grid"));
  }

  _setAutoRendering() {
    this.K3DInstance.setAutoRendering(this.model.get("auto_rendering"));
  }

  _setMenuVisibility() {
    this.K3DInstance.setMenuVisibility(this.model.get("menu_visibility"));
  }

  _setColorMapLegend() {
    this.K3DInstance.setColorMapLegend(this.model.get("colorbar_object_id"));
  }

  _setColorbarScientific() {
    this.K3DInstance.setColorbarScientific(
      this.model.get("colorbar_scientific")
    );
  }

  _setCamera() {
    this.K3DInstance.setCamera(this.model.get("camera"));
  }

  _setCameraAnimation() {
    this.K3DInstance.setCameraAnimation(this.model.get("camera_animation"));
  }

  _setRenderingSteps() {
    this.K3DInstance.setRenderingSteps(this.model.get("rendering_steps"));
  }

  _setAxes() {
    this.K3DInstance.setAxes(this.model.get("axes"));
  }

  _setName() {
    this.K3DInstance.setName(this.model.get("name"));
  }

  _setViewMode() {
    this.K3DInstance.setViewMode(this.model.get("mode"));
  }

  _setCameraMode() {
    this.K3DInstance.setCameraMode(this.model.get("camera_mode"));
  }

  _setManipulateMode() {
    this.K3DInstance.setManipulateMode(this.model.get("manipulate_mode"));
  }

  _setAxesHelper() {
    this.K3DInstance.setAxesHelper(this.model.get("axes_helper"));
  }

  _setSnapshotType() {
    this.K3DInstance.setSnapshotType(this.model.get("snapshot_type"));
  }

  _setCameraLock() {
    this.K3DInstance.setCameraLock(
      this.model.get("camera_no_rotate"),
      this.model.get("camera_no_zoom"),
      this.model.get("camera_no_pan")
    );
  }

  _setCameraSpeeds() {
    this.K3DInstance.setCameraSpeeds(
      this.model.get("camera_rotate_speed"),
      this.model.get("camera_zoom_speed"),
      this.model.get("camera_pan_speed")
    );
  }

  _setCameraFOV() {
    this.K3DInstance.setCameraFOV(this.model.get("camera_fov"));
  }

  _setCameraDampingFactor() {
    this.K3DInstance.setCameraDampingFactor(
      this.model.get("camera_damping_factor")
    );
  }

  _setClippingPlanes() {
    this.K3DInstance.setClippingPlanes(this.model.get("clipping_planes"));
  }

  _onObjectsListChange() {
    const oldObjectId = this.model.previous("object_ids");
    const newObjectId = this.model.get("object_ids");

    difference(oldObjectId, newObjectId).forEach((id: number) => {
      this.renderPromises.push(this.K3DInstance.removeObject(id));
    }, this);

    difference(newObjectId, oldObjectId).forEach((id: number) => {
      this.renderPromises.push(
        this.K3DInstance.load({
          objects: [objects[id].attributes],
        })
      );
    }, this);
  }

  refreshObject(obj, changed) {
    if (this.model.get("object_ids").indexOf(obj.get("id")) !== -1) {
      this.renderPromises.push(
        this.K3DInstance.reload(objects[obj.get("id")].attributes, changed)
      );
    }
  }

  processPhosphorMessage(msg) {
    super.processPhosphorMessage.call(this, msg);

    switch (msg.type) {
      case "after-attach":
        this.el.addEventListener("contextmenu", this, true);
        break;
      case "before-detach":
        this.el.removeEventListener("contextmenu", this, true);
        break;
      case "resize":
        this.handleResize();
        break;
      default:
        break;
    }
  }

  handleEvent(event) {
    switch (event.type) {
      case "contextmenu":
        this.handleContextMenu(event);
        break;
    }
  }

  handleContextMenu(event) {
    // Cancel context menu if on renderer:
    if (this.container.contains(event.target)) {
      event.preventDefault();
      event.stopPropagation();
    }
  }

  handleResize() {
    if (this.K3DInstance) {
      this.K3DInstance.resizeHelper();
    }
  }
}
