
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

  const activeData = useMemo(() => state.isT1 ? t1Data : t2Data, [state.isT1, t1Data, t2Data]);

  const texture = useMemo(() => {
    if (!activeData) return null;
    const { data, dims } = activeData;
    // Standard MRI orientation usually needs R,G,B or just R for 3D textures.
    // RedFormat is most efficient for grayscale voxel data.
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
  }, [activeData]);

  // Create a stable uniforms object so R3F doesn't overwrite runtime updates on re-render
  const uniforms = useMemo(() => THREE.UniformsUtils.clone(VolumeShader.uniforms), []);

  // Push latest state and texture into shader uniforms whenever they change
  useEffect(() => {
    if (!materialRef.current) return;
    const u: any = uniforms;
    if (texture) {
      u.u_data.value = texture;
      texture.needsUpdate = true;
    }
    u.u_thresholdMin.value = state.thresholdMin;
    u.u_thresholdMax.value = Math.min(1.0, state.thresholdMin + state.thresholdInterval);
    u.u_opacity.value = state.opacity;
    u.u_brightness.value = state.brightness;
    u.u_clipping.value = state.enableSlicing;
    u.u_clipX.value = state.sliceX;
    u.u_clipY.value = state.sliceY;
    u.u_clipZ.value = state.sliceZ;
    u.u_colorMode.value = state.isT1 ? 0 : 1;
    // Map state.colorMap to shader int (0: jet, 1: hsv, 2: turbo, 3: inferno)
    const cmap = state.colorMap === 'jet' ? 0 : state.colorMap === 'hsv' ? 1 : state.colorMap === 'turbo' ? 2 : 3;
    u.u_colorMap.value = cmap;
    u.u_useColorMap.value = state.useColorMap;
    // For ShaderMaterial, updating uniform values is enough; this is extra-safe
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (materialRef.current as any).uniformsNeedUpdate = true;
    materialRef.current.needsUpdate = true;
  }, [texture, state.thresholdMin, state.thresholdInterval, state.opacity, state.brightness, state.enableSlicing, state.sliceX, state.sliceY, state.sliceZ, state.isT1]);
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
    setHoveredCorner(idx);
    setIsDraggingCorner(true);
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
    } else {
      dragOffsetLocalRef.current = new THREE.Vector3(0, 0, 0);
    }
  };

  const onScenePointerMove = (e: any) => {
    if (!isDraggingCorner || !volumeGroupRef.current) return;
    e.stopPropagation();
    const plane = dragPlaneRef.current;
    if (!plane) return;
    const hit = new THREE.Vector3();
    if (e.ray && plane.intersectLine(new THREE.Line3(e.ray.origin, e.ray.origin.clone().add(e.ray.direction.clone().multiplyScalar(1000))), hit)) {
      const parent = volumeGroupRef.current.parent as THREE.Object3D | null;
      const hitLocal = hit.clone();
      if (parent) parent.worldToLocal(hitLocal);
      const offset = dragOffsetLocalRef.current || new THREE.Vector3(0,0,0);
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
    }
  };

  const onCornerPointerUp = (e: any) => {
    if (!isDraggingCorner) return;
    e.stopPropagation();
    setIsDraggingCorner(false);
    setHoveredCorner(null);
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
