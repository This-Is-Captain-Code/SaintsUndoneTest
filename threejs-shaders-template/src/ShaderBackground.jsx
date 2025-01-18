
import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import vertexShader from './shaders/vertex.glsl';
import fragmentShader from './shaders/fragment.glsl';
import trailFragmentShader from './shaders/trailFragment.glsl';
import trailVertexShader from './shaders/trailVertex.glsl';

const ShaderBackground = ({ className = '' }) => {
  const canvasRef = useRef(null);
  const rendererRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const renderer = new THREE.WebGLRenderer({ canvas, alpha: true });
    rendererRef.current = renderer;
    
    const scene = new THREE.Scene();
    const mouse = new THREE.Vector2();
    
    const sizes = {
      width: window.innerWidth,
      height: window.innerHeight,
    };

    // Initialize geometry
    const geometry = new THREE.PlaneGeometry(2, 2, 256, 256);
    const light = new THREE.PointLight(0xffffff, 1);
    light.position.set(0, 0, 2);
    scene.add(light);

    const normalMap = new THREE.TextureLoader().load('/T_tfilfair_2K_N.png');

    const material = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms: {
        uMouse: { value: mouse },
        uTrailTexture: { value: null },
        uNormalMap: { value: normalMap },
        uLightPosition: { value: light.position },
        uDecay: { value: 0.95 },
        uDisplacementStrength: { value: 0.05 },
        uEffectRadius: { value: 0.15 },
        uAmbient: { value: 0.5 },
        uDiffuseStrength: { value: 0.7 },
        uSpecularStrength: { value: 0.3 },
        uSpecularPower: { value: 16.0 },
        uWrap: { value: 0.5 }
      },
      side: THREE.DoubleSide,
    });

    const mesh = new THREE.Mesh(geometry, material);
    scene.add(mesh);

    // Initialize camera
    const camera = new THREE.PerspectiveCamera(45, sizes.width / sizes.height, 0.1, 100);
    camera.position.z = 2;
    scene.add(camera);

    // Initialize trail render targets
    const rtParams = {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      format: THREE.RGBAFormat,
      type: THREE.FloatType,
    };

    const accumulationTargetA = new THREE.WebGLRenderTarget(
      sizes.width,
      sizes.height,
      rtParams
    );

    const accumulationTargetB = new THREE.WebGLRenderTarget(
      sizes.width,
      sizes.height,
      rtParams
    );

    const trailMaterial = new THREE.ShaderMaterial({
      vertexShader: trailVertexShader,
      fragmentShader: trailFragmentShader,
      uniforms: {
        uPreviousTexture: { value: null },
        uCurrentTexture: { value: null },
        uMousePos: { value: mouse },
        uAccumulationStrength: { value: 0.98 },
        uTurbulenceScale: { value: 8.0 },
        uTurbulenceStrength: { value: 0.15 },
        uEdgeSharpness: { value: 0.15 },
        uSwirlStrength: { value: 0.02 },
        uTime: { value: 0.0 }
      },
    });

    const trailPlane = new THREE.Mesh(
      new THREE.PlaneGeometry(2, 2),
      trailMaterial
    );
    const trailScene = new THREE.Scene();
    trailScene.add(trailPlane);

    const trailCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10);
    trailCamera.position.z = 1;

    // Clear initial render targets
    renderer.setRenderTarget(accumulationTargetA);
    renderer.clear();
    renderer.setRenderTarget(accumulationTargetB);
    renderer.clear();
    renderer.setRenderTarget(null);

    const handleResize = () => {
      sizes.width = window.innerWidth;
      sizes.height = window.innerHeight;

      camera.aspect = sizes.width / sizes.height;
      camera.updateProjectionMatrix();

      renderer.setSize(sizes.width, sizes.height);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

      accumulationTargetA.setSize(sizes.width, sizes.height);
      accumulationTargetB.setSize(sizes.width, sizes.height);
    };

    const handleMouseMove = (event) => {
      mouse.x = event.clientX / sizes.width;
      mouse.y = 1 - event.clientY / sizes.height;
    };

    const updateTrailTexture = () => {
      trailMaterial.uniforms.uTime.value += 0.01;

      const currentTarget = accumulationTargetA;
      const previousTarget = accumulationTargetB;

      trailMaterial.uniforms.uPreviousTexture.value = previousTarget.texture;
      trailMaterial.uniforms.uMousePos.value = mouse;

      renderer.setRenderTarget(currentTarget);
      renderer.render(trailScene, trailCamera);
      renderer.setRenderTarget(null);

      material.uniforms.uTrailTexture.value = currentTarget.texture;

      [accumulationTargetA, accumulationTargetB] = [accumulationTargetB, accumulationTargetA];
    };

    const animate = () => {
      updateTrailTexture();
      renderer.render(scene, camera);
      requestAnimationFrame(animate);
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    window.addEventListener('mousemove', handleMouseMove);
    animate();

    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('mousemove', handleMouseMove);
      renderer.dispose();
      material.dispose();
      geometry.dispose();
    };
  }, []);

  return (
    <canvas 
      ref={canvasRef} 
      className={`fixed top-0 left-0 w-full h-full outline-none pointer-events-none -z-10 ${className}`}
    />
  );
};

export default ShaderBackground;
