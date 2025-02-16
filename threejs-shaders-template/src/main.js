import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import GUI from "lil-gui";
import vertexShader from "./shaders/vertex.glsl";
import fragmentShader from "./shaders/fragment.glsl";
import trailFragmentShader from "./shaders/trailFragment.glsl";
import trailVertexShader from "./shaders/trailVertex.glsl";
import "./style.css";

class ShaderRenderer {
  constructor() {
    // Debug
    this.gui = new GUI();

    // Mouse
    this.mouse = new THREE.Vector2();
    this.trails = [];
    this.maxTrails = 3;
    this.trailSpeed = 0.005;
    
    // Trail generator
    setInterval(() => {
      if (this.trails.length < this.maxTrails) {
        const startX = Math.random();
        const startY = Math.random();
        const angle = Math.random() * Math.PI * 2;
        this.trails.push({
          position: new THREE.Vector2(startX, startY),
          angle: angle,
          life: 1.0
        });
      }
    }, 2000);

    // Canvas
    this.canvas = document.querySelector("canvas.webgl");

    // Scene
    this.scene = new THREE.Scene();

    // Sizes
    this.sizes = {
      width: window.innerWidth,
      height: window.innerHeight,
    };

    // Time
    this.clock = new THREE.Clock();

    this.initRenderer();
    this.initGeometry();
    this.initTrailRenderTarget();
    this.initCamera();
    this.initControls();
    this.initEventListeners();
    this.startAnimationLoop();
  }

  initGeometry() {
    // Initialize with a default geometry, will be updated when texture loads
    this.geometry = new THREE.PlaneGeometry(1, 1, 256, 256);
    
    // Add size controls to GUI
    const sizeFolder = this.gui.addFolder('Size Controls');
    sizeFolder.add({ width: 1.5 }, 'width', 0.1, 4.0, 0.1)
      .onChange((value) => {
        this.mesh.scale.x = value;
      });
    sizeFolder.add({ height: 1.5 }, 'height', 0.1, 4.0, 0.1)
      .onChange((value) => {
        this.mesh.scale.y = value;
      });

    // Light
    this.light = new THREE.PointLight(0xffffff, 1);
    this.light.position.set(2, 2, 2);
    this.scene.add(this.light);

    // Load textures
    const textureLoader = new THREE.TextureLoader();
    const normalMap = textureLoader.load('/NormalMap7.png', (texture) => {
      const aspectRatio = texture.image.width / texture.image.height;
      // Update geometry to match texture dimensions while maintaining center position
      this.geometry = new THREE.PlaneGeometry(aspectRatio * 1.5, 1.5, 256, 256);
      this.mesh.geometry = this.geometry;
    });

    // Material
    // Define lighting profiles
    this.profiles = {
      original: {
        ambient: 0.3,
        diffuseStrength: 1.0,
        specularStrength: 0.5,
        specularPower: 32.0,
        wrap: 0.0,
      },
      soft: {
        ambient: 0.5,
        diffuseStrength: 0.7,
        specularStrength: 0.3,
        specularPower: 16.0,
        wrap: 0.5,
      },
      purple: {
        ambient: 0.4,
        diffuseStrength: 0.6,
        specularStrength: 0.8,
        specularPower: 24.0,
        wrap: 0.2,
        color: new THREE.Color('#ec3249'), // Purple tint
      },
    };

    this.currentProfile = 'soft';

    // Update the material
    // Load albedo texture
    const albedoMap = textureLoader.load('/background.png');
    
    this.material = new THREE.ShaderMaterial({
      vertexShader: vertexShader,
      fragmentShader: fragmentShader,
      uniforms: {
        uAlbedoMap: { value: albedoMap },
        uMouse: { value: this.mouse },
        uTrailTexture: { value: null },
        uNormalMap: { value: normalMap },
        uLightPosition: { value: this.light.position },
        uDecay: { value: 0.95 },
        uDisplacementStrength: { value: 0.05 },
        uEffectRadius: { value: 0.15 },
        uAmbient: { value: this.profiles.soft.ambient },
        uDiffuseStrength: { value: this.profiles.soft.diffuseStrength },
        uSpecularStrength: { value: this.profiles.soft.specularStrength },
        uSpecularPower: { value: this.profiles.soft.specularPower },
        uWrap: { value: this.profiles.soft.wrap },
        uColor: { value: new THREE.Color(1, 1, 1) }, // Default to white
      },
      side: THREE.DoubleSide,
    });

    // Mesh
    this.mesh = new THREE.Mesh(this.geometry, this.material);
    this.scene.add(this.mesh);

    // Debug controls
    const effectFolder = this.gui.addFolder('Effect Controls');

    // Add profile switcher
    // Update GUI controls
    effectFolder
    .add({ profile: this.currentProfile }, 'profile', ['original', 'soft', 'purple'])
    .onChange((value) => {
      this.currentProfile = value;
      const profile = this.profiles[value];
      this.material.uniforms.uAmbient.value = profile.ambient;
      this.material.uniforms.uDiffuseStrength.value = profile.diffuseStrength;
      this.material.uniforms.uSpecularStrength.value = profile.specularStrength;
      this.material.uniforms.uSpecularPower.value = profile.specularPower;
      this.material.uniforms.uWrap.value = profile.wrap;
      this.material.uniforms.uColor.value = profile.color || new THREE.Color(1, 1, 1);
    });
    effectFolder.add(this.material.uniforms.uDisplacementStrength, "value", 0.0, 0.2, 0.001).name("Displacement");
    effectFolder.add(this.material.uniforms.uEffectRadius, "value", 0.1, 0.5, 0.01).name("Radius");
    effectFolder.add(this.material.uniforms.uDecay, "value", 0.0, 1.0, 0.01).name("Decay");
    effectFolder.add(this.material.uniforms.uSpecularStrength, "value", 0.0, 2.0, 0.01).name("Shininess Strength");
    effectFolder.add(this.material.uniforms.uSpecularPower, "value", 1.0, 64.0, 1.0).name("Shininess Power");
  }

  initTrailRenderTarget() {
    const rtParams = {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      format: THREE.RGBAFormat,
      type: THREE.FloatType,
    };

    // Create ping-pong buffers for accumulation
    this.accumulationTargetA = new THREE.WebGLRenderTarget(
      this.sizes.width,
      this.sizes.height,
      rtParams
    );

    this.accumulationTargetB = new THREE.WebGLRenderTarget(
      this.sizes.width,
      this.sizes.height,
      rtParams
    );

    // Material for accumulation
    this.trailMaterial = new THREE.ShaderMaterial({
      vertexShader: trailVertexShader,
      fragmentShader: trailFragmentShader,
      uniforms: {
        uPreviousTexture: { value: null },
        uCurrentTexture: { value: null },
        uMousePos: { value: this.mouse },
        uAccumulationStrength: { value: 0.98 },
        uTurbulenceScale: { value: 8.0 },
        uTurbulenceStrength: { value: 0.15 },
        uEdgeSharpness: { value: 0.15 },
        uSwirlStrength: { value: 0.02 },
        uTime: { value: 0.0 }
      },
    });

    // Add GUI controls for fluid effects
    const fluidFolder = this.gui.addFolder('Fluid Controls');
    fluidFolder.add(this.trailMaterial.uniforms.uTurbulenceScale, 'value', 1.0, 20.0, 0.1).name('Turbulence Scale');
    fluidFolder.add(this.trailMaterial.uniforms.uTurbulenceStrength, 'value', 0.0, 0.5, 0.01).name('Turbulence Strength');
    fluidFolder.add(this.trailMaterial.uniforms.uEdgeSharpness, 'value', 0.01, 0.3, 0.01).name('Edge Sharpness');
    fluidFolder.add(this.trailMaterial.uniforms.uSwirlStrength, 'value', 0.0, 0.1, 0.001).name('Swirl Strength');
    fluidFolder.add(this.trailMaterial.uniforms.uAccumulationStrength, 'value', 0.9, 0.999, 0.001).name('Trail Persistence');

    // Setup accumulation scene
    this.trailPlane = new THREE.Mesh(
      new THREE.PlaneGeometry(2, 2),
      this.trailMaterial
    );
    this.trailScene = new THREE.Scene();
    this.trailScene.add(this.trailPlane);

    this.trailCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10);
    this.trailCamera.position.z = 1;

    // Clear initial render targets
    this.renderer.setRenderTarget(this.accumulationTargetA);
    this.renderer.clear();
    this.renderer.setRenderTarget(this.accumulationTargetB);
    this.renderer.clear();
    this.renderer.setRenderTarget(null);
  }

  initCamera() {
    const fov = 45;
    const aspect = this.sizes.width / this.sizes.height;
    this.camera = new THREE.PerspectiveCamera(fov, aspect, 0.1, 100);
    
    // Calculate camera position to fit plane in view
    const distance = this.calculateCameraDistance(fov);
    this.camera.position.z = distance;
    
    this.scene.add(this.camera);
  }

  calculateCameraDistance(fov) {
    const planeHeight = 1.5; // Your plane height
    return (planeHeight / 2) / Math.tan((fov / 2) * Math.PI / 180);
  }

  initRenderer() {
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
    });
    this.renderer.setSize(this.sizes.width, this.sizes.height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  }

  initControls() {
    // Remove controls for background use
  }

  initEventListeners() {
    window.addEventListener("resize", () => this.handleResize());
    window.addEventListener("mousemove", (event) => this.handleMouseMove(event));
  }

  handleMouseMove(event) {
    this.mouse.x = event.clientX / this.sizes.width;
    this.mouse.y = 1 - event.clientY / this.sizes.height;
  }

  updateTrails() {
    // Update existing trails
    this.trails = this.trails.filter(trail => {
      // Move trail
      trail.position.x += Math.cos(trail.angle) * this.trailSpeed;
      trail.position.y += Math.sin(trail.angle) * this.trailSpeed;
      
      // Reduce life
      trail.life -= 0.001;
      
      // Remove if out of bounds or dead
      return trail.life > 0 && 
             trail.position.x >= 0 && trail.position.x <= 1 &&
             trail.position.y >= 0 && trail.position.y <= 1;
    });
  }

  handleResize() {
    // Update sizes
    this.sizes.width = window.innerWidth;
    this.sizes.height = window.innerHeight;

    // Update camera
    this.camera.aspect = this.sizes.width / this.sizes.height;
    const distance = this.calculateCameraDistance(45);
    this.camera.position.z = distance;
    this.camera.updateProjectionMatrix();

    // Update renderer
    this.renderer.setSize(this.sizes.width, this.sizes.height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    // Update trail render targets
    this.accumulationTargetA.setSize(this.sizes.width, this.sizes.height);
    this.accumulationTargetB.setSize(this.sizes.width, this.sizes.height);
  }

  updateTrailTexture() {
    // Update time uniform
    this.trailMaterial.uniforms.uTime.value += 0.01;

    // Ping-pong between render targets
    const currentTarget = this.accumulationTargetA;
    const previousTarget = this.accumulationTargetB;

    // Update uniforms
    this.trailMaterial.uniforms.uPreviousTexture.value = previousTarget.texture;
    // Handle both mouse and autonomous trails
    const mainTrail = (this.mouse.x > 0 && this.mouse.x < 1 && this.mouse.y > 0 && this.mouse.y < 1) ? 
      this.mouse : 
      (this.trails.length > 0 ? this.trails[0].position : new THREE.Vector2(-1, -1));
    
    // Update trail position based on frame count
    const frameIndex = Math.floor(this.trailMaterial.uniforms.uTime.value * 100) % (this.trails.length + 1);
    this.trailMaterial.uniforms.uMousePos.value = frameIndex === 0 ? mainTrail : 
      (this.trails[frameIndex - 1]?.position || mainTrail);
    
    this.updateTrails();

    // Render accumulation
    this.renderer.setRenderTarget(currentTarget);
    this.renderer.render(this.trailScene, this.trailCamera);
    this.renderer.setRenderTarget(null);

    // Update main material
    this.material.uniforms.uTrailTexture.value = currentTarget.texture;

    // Swap buffers
    [this.accumulationTargetA, this.accumulationTargetB] =
      [this.accumulationTargetB, this.accumulationTargetA];
  }

  animate() {
    // Update controls
    //this.controls.update();

    // Update the trail texture
    this.updateTrailTexture();

    // Render the main scene
    this.renderer.render(this.scene, this.camera);

    // Call animate again on the next frame
    window.requestAnimationFrame(() => this.animate());
  }

  startAnimationLoop() {
    this.animate();
  }
}

// Initialize the renderer when the script loads
const shaderRenderer = new ShaderRenderer();