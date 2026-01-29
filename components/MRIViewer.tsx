
import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { Text } from '@react-three/drei';
import { MRIState, NiftiData } from '../types';
import { VolumeShader } from './VolumeMaterial';

interface MRIViewerProps {
  t1Data: NiftiData | null;
  t2Data: NiftiData | null;
  state: MRIState;
  setState: React.Dispatch<React.SetStateAction<MRIState>>;
}

const MRIViewer: React.FC<MRIViewerProps> = ({ t1Data, t2Data, state, setState }) => {
  const materialRef = useRef<THREE.ShaderMaterial>(null);
  const volumeGroupRef = useRef<THREE.Group>(null);
  const [isRotating, setIsRotating] = useState(true);
  
  

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
    u.u_density.value = state.brightnessFine;
    u.u_mixT1T2.value = state.mixT1T2;
    u.u_colorMode.value = state.isT1 ? 0 : 1;
    // For ShaderMaterial, updating uniform values is enough; this is extra-safe
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (materialRef.current as any).uniformsNeedUpdate = true;
    materialRef.current.needsUpdate = true;
  }, [t1Texture, t2Texture, t1Data, t2Data, state.thresholdMin, state.thresholdInterval, state.opacity, state.brightness, state.brightnessFine, state.mixT1T2]);

  // Ensure the material uses our stable uniforms object when (re)mounted
  useEffect(() => {
    if (materialRef.current) {
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
    u.u_density.value = state.brightnessFine;
    u.u_mixT1T2.value = state.mixT1T2;
    u.u_colorMode.value = state.isT1 ? 0 : 1;

    // Controller joystick handling removed for simplicity
  });
  const spatialScale = activeData?.aspectRatio || [1, 1, 1];

  return (
    <group scale={0.7}>
      {/* Title Label */}
      <group position={[0, 0.65 * spatialScale[1], 0]}>
        <Text fontSize={0.045} color="#2dd4bf" anchorY="bottom" fontWeight="bold">
          {state.isT1 ? "MRI_CORE // T1_WEIGHTED" : "MRI_CORE // T2_WEIGHTED"}
        </Text>
      </group>

      <group ref={volumeGroupRef}>
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

        {/* Corner grab handles removed for simplicity */}
      </group>
    </group>
  );
};

export default MRIViewer;
