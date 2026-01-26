
import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import { Text } from '@react-three/drei';
import { MRIState, NiftiData } from '../types';
import { VolumeShader } from './VolumeMaterial';

interface MRIViewerProps {
  t1Data: NiftiData | null;
  t2Data: NiftiData | null;
  state: MRIState;
}

const MRIViewer: React.FC<MRIViewerProps> = ({ t1Data, t2Data, state }) => {
  const materialRef = useRef<THREE.ShaderMaterial>(null);
  const volumeGroupRef = useRef<THREE.Group>(null);
  const [isRotating, setIsRotating] = useState(true);
  const [hoveredCorner, setHoveredCorner] = useState<number | null>(null);
  const [isDraggingCorner, setIsDraggingCorner] = useState(false);
  const { camera } = useThree();
  const dragPlaneRef = useRef<THREE.Plane | null>(null);
  const dragOffsetLocalRef = useRef<THREE.Vector3 | null>(null);
  const activeCornerRef = useRef<number | null>(null);
  const dragModeRef = useRef<'move' | 'scale' | null>(null);
  const initialScaleRef = useRef<THREE.Vector3 | null>(null);
  const initialGroupPosRef = useRef<THREE.Vector3 | null>(null);
  const pointerIdRef = useRef<number | null>(null);
  const selectActiveRef = useRef<boolean>(false);
  const selectEndTimeoutRef = useRef<number | null>(null);

  const activeData = useMemo(() => state.isT1 ? t1Data : t2Data, [state.isT1, t1Data, t2Data]);

  const t1Texture = useMemo(() => {
    if (!t1Data) return null;
    const { data, dims } = t1Data;
    const tex = new THREE.Data3DTexture(data, dims[0], dims[1], dims[2]);
    tex.format = THREE.RedFormat;
    tex.type = THREE.UnsignedByteType;
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.unpackAlignment = 1;
    tex.wrapS = THREE.ClampToEdgeWrapping;
    tex.wrapT = THREE.ClampToEdgeWrapping;
    tex.wrapR = THREE.ClampToEdgeWrapping;
    tex.needsUpdate = true;
    return tex;
  }, [t1Data]);

  const t2Texture = useMemo(() => {
    if (!t2Data) return null;
    const { data, dims } = t2Data;
    const tex = new THREE.Data3DTexture(data, dims[0], dims[1], dims[2]);
    tex.format = THREE.RedFormat;
    tex.type = THREE.UnsignedByteType;
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.unpackAlignment = 1;
    tex.wrapS = THREE.ClampToEdgeWrapping;
    tex.wrapT = THREE.ClampToEdgeWrapping;
    tex.wrapR = THREE.ClampToEdgeWrapping;
    tex.needsUpdate = true;
    return tex;
  }, [t2Data]);

  // Create a stable uniforms object so R3F doesn't overwrite runtime updates on re-render
  const uniforms = useMemo(() => THREE.UniformsUtils.clone(VolumeShader.uniforms), []);

  // Push latest state and texture into shader uniforms whenever they change
  useEffect(() => {
    if (!materialRef.current) return;
    const u: any = uniforms;
    if (t1Texture) {
      u.u_data.value = t1Texture;
      t1Texture.needsUpdate = true;
    }
    if (t2Texture) {
      u.u_data2.value = t2Texture;
      t2Texture.needsUpdate = true;
    }
    u.u_thresholdMin.value = state.thresholdMin;
    u.u_thresholdMax.value = Math.min(1.0, state.thresholdMin + state.thresholdInterval);
    u.u_opacity.value = state.opacity;
    u.u_brightness.value = state.brightness;
    u.u_clipping.value = state.enableSlicing;
    u.u_clipX.value = state.sliceX;
    u.u_clipY.value = state.sliceY;
    u.u_clipZ.value = state.sliceZ;
    u.u_mixT1T2.value = state.mixT1T2;
    u.u_sharpenEnabled.value = state.sharpenEnabled;
    u.u_sharpenStrength.value = state.sharpenStrength;
    // Estimate texel size from whichever data available (assume equal dims)
    const dims = t1Data?.dims || t2Data?.dims;
    if (dims) {
      u.u_texelSize.value.set(1.0 / dims[0], 1.0 / dims[1], 1.0 / dims[2]);
    }
    u.u_colorMode.value = state.isT1 ? 0 : 1;
    // Map state.colorMap to shader int (0: jet, 1: hsv, 2: turbo, 3: inferno)
    const cmap = state.colorMap === 'jet' ? 0 : state.colorMap === 'hsv' ? 1 : state.colorMap === 'turbo' ? 2 : 3;
    u.u_colorMap.value = cmap;
    u.u_useColorMap.value = state.useColorMap;
    // For ShaderMaterial, updating uniform values is enough; this is extra-safe
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (materialRef.current as any).uniformsNeedUpdate = true;
    materialRef.current.needsUpdate = true;
  }, [t1Texture, t2Texture, t1Data, t2Data, state.thresholdMin, state.thresholdInterval, state.opacity, state.brightness, state.enableSlicing, state.sliceX, state.sliceY, state.sliceZ, state.isT1, state.mixT1T2, state.sharpenEnabled, state.sharpenStrength]);
  // Note: colorMap and useColorMap are mirrored per-frame below

  // Ensure the material uses our stable uniforms object when (re)mounted
  useEffect(() => {
    if (materialRef.current) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (materialRef.current as any).uniforms = uniforms as any;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (materialRef.current as any).uniformsNeedUpdate = true;
      materialRef.current.needsUpdate = true;
    }
  }, [uniforms]);

  useFrame((_, delta) => {
    // Mirror latest state to uniforms each frame to guarantee responsiveness
    const u: any = uniforms;
    u.u_thresholdMin.value = state.thresholdMin;
    u.u_thresholdMax.value = Math.min(1.0, state.thresholdMin + state.thresholdInterval);
    u.u_opacity.value = state.opacity;
    u.u_brightness.value = state.brightness;
    u.u_clipping.value = state.enableSlicing;
    u.u_clipX.value = state.sliceX;
    u.u_clipY.value = state.sliceY;
    u.u_clipZ.value = state.sliceZ;
    u.u_mixT1T2.value = state.mixT1T2;
    u.u_sharpenEnabled.value = state.sharpenEnabled;
    u.u_sharpenStrength.value = state.sharpenStrength;
    u.u_colorMode.value = state.isT1 ? 0 : 1;
    const cmap = state.colorMap === 'jet' ? 0 : state.colorMap === 'hsv' ? 1 : state.colorMap === 'turbo' ? 2 : 3;
    u.u_colorMap.value = cmap;
    u.u_useColorMap.value = state.useColorMap;

    if (volumeGroupRef.current && isRotating) {
      volumeGroupRef.current.rotation.y += delta * 0.12;
    }
  });

  const spatialScale = activeData?.aspectRatio || [1, 1, 1];
  const cornerLocalPositions: [number, number, number][] = useMemo(() => ([
    [-0.5, -0.5, -0.5], [0.5, -0.5, -0.5], [-0.5, 0.5, -0.5], [0.5, 0.5, -0.5],
    [-0.5, -0.5, 0.5],  [0.5, -0.5, 0.5],  [-0.5, 0.5, 0.5],  [0.5, 0.5, 0.5],
  ]), []);

  const onCornerPointerOver = (idx: number) => (e: any) => {
    e.stopPropagation();
    setHoveredCorner(idx);
  };
  const onCornerPointerOut = () => (e: any) => {
    e.stopPropagation();
    setHoveredCorner((prev) => (isDraggingCorner ? prev : null));
  };

  const onCornerPointerDown = (idx: number) => (e: any) => {
    e.stopPropagation();
    // Require primary/trigger to grab
    const hasPrimary = (e.buttons & 1) === 1 || e.button === 0 || e.nativeEvent?.isPrimary === true;
    if (!hasPrimary) return;
    // Only corner 0 (move) and corner 7 (scale) are interactive
    if (!(idx === 0 || idx === 7)) return;

    setHoveredCorner(idx);
    setIsDraggingCorner(true);
    activeCornerRef.current = idx;
    dragModeRef.current = idx === 0 ? 'move' : 'scale';
    // Capture this pointer so move events remain stable during XR gestures
    try { (e.target as any).setPointerCapture?.(e.pointerId); pointerIdRef.current = e.pointerId; } catch {}
    if (!volumeGroupRef.current) return;
    // Construct a plane perpendicular to camera forward through current group world position
    const groupWorldPos = new THREE.Vector3();
    volumeGroupRef.current.getWorldPosition(groupWorldPos);
    const forward = new THREE.Vector3();
    camera.getWorldDirection(forward);
    dragPlaneRef.current = new THREE.Plane().setFromNormalAndCoplanarPoint(forward, groupWorldPos);
    // Compute initial hit and store local offset so the corner grab doesn't snap the center
    const hit = new THREE.Vector3();
    if (e.ray && dragPlaneRef.current.intersectLine(new THREE.Line3(e.ray.origin, e.ray.origin.clone().add(e.ray.direction.clone().multiplyScalar(1000))), hit)) {
      const parent = volumeGroupRef.current.parent as THREE.Object3D | null;
      const hitLocal = hit.clone();
      if (parent) parent.worldToLocal(hitLocal);
      dragOffsetLocalRef.current = hitLocal.clone().sub(volumeGroupRef.current.position.clone());
      initialGroupPosRef.current = volumeGroupRef.current.position.clone();
      initialScaleRef.current = volumeGroupRef.current.scale.clone();
    } else {
      dragOffsetLocalRef.current = new THREE.Vector3(0, 0, 0);
    }
  };

  const onScenePointerMove = (e: any) => {
    if (!isDraggingCorner || !volumeGroupRef.current) return;
    e.stopPropagation();
    if (pointerIdRef.current !== null && e.pointerId !== pointerIdRef.current) return;
    const plane = dragPlaneRef.current;
    if (!plane) return;
    const hit = new THREE.Vector3();
    if (e.ray && plane.intersectLine(new THREE.Line3(e.ray.origin, e.ray.origin.clone().add(e.ray.direction.clone().multiplyScalar(1000))), hit)) {
      const parent = volumeGroupRef.current.parent as THREE.Object3D | null;
      const hitLocal = hit.clone();
      if (parent) parent.worldToLocal(hitLocal);
      const offset = dragOffsetLocalRef.current || new THREE.Vector3(0,0,0);
      if (dragModeRef.current === 'move') {
        const targetLocal = hitLocal.clone().sub(offset);
        // Clamp position near the camera (max radius 2.5m)
        const camWorld = camera.position.clone();
        const targetWorld = targetLocal.clone();
        if (parent) parent.localToWorld(targetWorld);
        const maxDist = 2.5;
        const dist = targetWorld.distanceTo(camWorld);
        if (dist > maxDist) {
          const dir = targetWorld.clone().sub(camWorld).normalize();
          targetWorld.copy(camWorld.clone().add(dir.multiplyScalar(maxDist)));
          if (parent) parent.worldToLocal(targetLocal.copy(targetWorld));
        }
        volumeGroupRef.current.position.copy(targetLocal);
      } else if (dragModeRef.current === 'scale') {
        // Scale uniformly based on drag delta length from initial position
        const startPos = initialGroupPosRef.current || new THREE.Vector3();
        const initialScale = initialScaleRef.current || new THREE.Vector3(1,1,1);
        const delta = hitLocal.clone().sub((startPos.clone().add(offset)));
        const k = 1.0 + delta.length() * 0.8 * (delta.dot(new THREE.Vector3(1,1,1).normalize()) >= 0.0 ? 1.0 : -1.0);
        const newScale = new THREE.Vector3(
          THREE.MathUtils.clamp(initialScale.x * k, 0.2, 3.0),
          THREE.MathUtils.clamp(initialScale.y * k, 0.2, 3.0),
          THREE.MathUtils.clamp(initialScale.z * k, 0.2, 3.0)
        );
        volumeGroupRef.current.scale.copy(newScale);
      }
    }
  };

  const onCornerPointerUp = (e: any) => {
    if (!isDraggingCorner || selectActiveRef.current) return;
    e.stopPropagation();
    setIsDraggingCorner(false);
    setHoveredCorner(null);
    activeCornerRef.current = null;
    dragModeRef.current = null;
    try { (e.target as any).releasePointerCapture?.(e.pointerId); pointerIdRef.current = null; } catch {}
  };

  const onCornerSelectStart = (idx: number) => (e: any) => {
    e.stopPropagation();
    // Only corner 0 (move) and 7 (scale)
    if (!(idx === 0 || idx === 7)) return;
    // Cancel any pending release from a previous select end
    if (selectEndTimeoutRef.current !== null) {
      clearTimeout(selectEndTimeoutRef.current);
      selectEndTimeoutRef.current = null;
    }
    selectActiveRef.current = true;
    setHoveredCorner(idx);
    setIsDraggingCorner(true);
    activeCornerRef.current = idx;
    dragModeRef.current = idx === 0 ? 'move' : 'scale';
    if (!volumeGroupRef.current) return;
    const groupWorldPos = new THREE.Vector3();
    volumeGroupRef.current.getWorldPosition(groupWorldPos);
    const forward = new THREE.Vector3();
    camera.getWorldDirection(forward);
    dragPlaneRef.current = new THREE.Plane().setFromNormalAndCoplanarPoint(forward, groupWorldPos);
    const hit = new THREE.Vector3();
    if (e.ray && dragPlaneRef.current.intersectLine(new THREE.Line3(e.ray.origin, e.ray.origin.clone().add(e.ray.direction.clone().multiplyScalar(1000))), hit)) {
      const parent = volumeGroupRef.current.parent as THREE.Object3D | null;
      const hitLocal = hit.clone();
      if (parent) parent.worldToLocal(hitLocal);
      dragOffsetLocalRef.current = hitLocal.clone().sub(volumeGroupRef.current.position.clone());
      initialGroupPosRef.current = volumeGroupRef.current.position.clone();
      initialScaleRef.current = volumeGroupRef.current.scale.clone();
    } else {
      dragOffsetLocalRef.current = new THREE.Vector3(0, 0, 0);
    }
  };

  const onCornerSelectEnd = (e: any) => {
    e.stopPropagation();
    // Use a short grace period to avoid flicker when pinch signal briefly drops
    if (selectEndTimeoutRef.current !== null) clearTimeout(selectEndTimeoutRef.current);
    selectEndTimeoutRef.current = window.setTimeout(() => {
      selectActiveRef.current = false;
      if (!isDraggingCorner) return;
      setIsDraggingCorner(false);
      setHoveredCorner(null);
      activeCornerRef.current = null;
      dragModeRef.current = null;
      selectEndTimeoutRef.current = null;
    }, 120);
  };

  const onCornerPointerCancel = (e: any) => {
    // Ignore pointer cancel if XR select is active; pointer capture remains until select ends
    if (selectActiveRef.current) return;
    onCornerPointerUp(e);
  };

  return (
    <group scale={0.7}>
      {/* Title Label */}
      <group position={[0, 0.65 * spatialScale[1], 0]}>
        <Text fontSize={0.045} color="#2dd4bf" anchorY="bottom" fontWeight="bold">
          {state.isT1 ? "MRI_CORE // T1_WEIGHTED" : "MRI_CORE // T2_WEIGHTED"}
        </Text>
      </group>

      <group ref={volumeGroupRef} onPointerMove={onScenePointerMove} onPointerUp={onCornerPointerUp}>
        {/* The Raymarched Volume */}
        <mesh 
          onPointerDown={() => setIsRotating(false)} 
          onPointerUp={() => setIsRotating(true)}
          scale={spatialScale}
        >
          <boxGeometry args={[1, 1, 1]} />
          <shaderMaterial
            // Force a remount when switching modality to guarantee texture swap
            key={state.isT1 ? 't1' : 't2'}
            ref={materialRef}
            transparent
            side={THREE.BackSide} // Render back faces to ensure rays always pass through the box
            uniforms={uniforms}
            vertexShader={VolumeShader.vertexShader}
            fragmentShader={VolumeShader.fragmentShader}
            depthWrite={false}
            depthTest={true}
          />
        </mesh>

        {/* Diagnostic Wireframe Container */}
        <group scale={spatialScale}>
          {[
            [[0, 0.5, 0.5], [1, 0.005, 0.005]], [[0, -0.5, 0.5], [1, 0.005, 0.005]], [[0, 0.5, -0.5], [1, 0.005, 0.005]], [[0, -0.5, -0.5], [1, 0.005, 0.005]],
            [[0.5, 0, 0.5], [0.005, 1, 0.005]], [[-0.5, 0, 0.5], [0.005, 1, 0.005]], [[0.5, 0, -0.5], [0.005, 1, 0.005]], [[-0.5, 0, -0.5], [0.005, 1, 0.005]],
            [[0.5, 0.5, 0], [0.005, 0.005, 1]], [[-0.5, 0.5, 0], [0.005, 0.005, 1]], [[0.5, -0.5, 0], [0.005, 0.005, 1]], [[-0.5, -0.5, 0], [0.005, 0.005, 1]]
          ].map((conf, i) => (
            <mesh key={i} position={conf[0] as [number, number, number]}>
              <boxGeometry args={conf[1] as [number, number, number]} />
              <meshBasicMaterial color="#2dd4bf" transparent opacity={0.3} />
            </mesh>
          ))}
        </group>

        {/* Corner Grab Handles */}
        <group scale={spatialScale}>
          {cornerLocalPositions.map((p, i) => (
            <mesh
              key={`corner-${i}`}
              position={p as [number, number, number]}
              onPointerOver={onCornerPointerOver(i)}
              onPointerOut={onCornerPointerOut()}
              onPointerDown={onCornerPointerDown(i)}
              onPointerUp={onCornerPointerUp}
              onPointerCancel={onCornerPointerCancel}
              onSelectStart={onCornerSelectStart(i) as any}
              onSelectEnd={onCornerSelectEnd as any}
            >
              <sphereGeometry args={[0.035, 16, 16]} />
              <meshBasicMaterial color={hoveredCorner === i ? '#ffffff' : '#2dd4bf'} transparent opacity={hoveredCorner === i || isDraggingCorner ? 0.9 : 0.0} />
            </mesh>
          ))}
        </group>
      </group>
    </group>
  );
};

export default MRIViewer;
