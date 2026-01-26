
import React, { useRef, useState, useCallback, memo } from 'react';
import { Text } from '@react-three/drei';
import { ThreeEvent } from '@react-three/fiber';
import * as THREE from 'three';
import { MRIState } from '../types';
import { audioService } from '../services/audio';

interface DashboardProps { state: MRIState; setState: React.Dispatch<React.SetStateAction<MRIState>>; }

const Button = memo(({ text, width, height, position = [0, 0, 0], onClick, active }: any) => (
  <group position={position} onPointerDown={(e) => { e.stopPropagation(); onClick(); }}>
    <mesh>
      <planeGeometry args={[width, height]} />
      <meshBasicMaterial color={active ? "#0d9488" : "#1e293b"} />
    </mesh>
    <Text fontSize={0.014} color="#ffffff" position={[0, 0, 0.01]} fontWeight="bold">{text}</Text>
  </group>
));

const DraggableSlider = memo(({ label, value, min, max, position, onChange }: any) => {
  const [isDragging, setIsDragging] = useState(false);
  const trackRef = useRef<THREE.Group>(null);
  const pointerIdRef = useRef<number | null>(null);
  
  const trackW = 0.22; 
  const normalized = (value - min) / (max - min);

  const handlePointerDown = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    if (pointerIdRef.current !== null) return;
    
    (e.target as any).setPointerCapture(e.pointerId);
    pointerIdRef.current = e.pointerId;
    setIsDragging(true);
    update(e);
    audioService.playSoftBeep(440, 'sine');
  };

  const handlePointerMove = (e: ThreeEvent<PointerEvent>) => {
    if (isDragging && e.pointerId === pointerIdRef.current) {
      e.stopPropagation();
      update(e);
    }
  };

  const handlePointerUp = (e: ThreeEvent<PointerEvent>) => {
    if (e.pointerId === pointerIdRef.current) {
      e.stopPropagation();
      (e.target as any).releasePointerCapture(e.pointerId);
      pointerIdRef.current = null;
      setIsDragging(false);
      audioService.playSoftBeep(330, 'sine');
    }
  };

  const update = (e: ThreeEvent<PointerEvent>) => {
    if (!trackRef.current) return;
    
    // Most robust mapping: Project point onto track's local space
    const localPoint = new THREE.Vector3().copy(e.point);
    trackRef.current.worldToLocal(localPoint);
    
    // trackW is the visual width centered at 0
    const rawX = (localPoint.x + trackW / 2) / trackW;
    const clampedX = Math.max(0, Math.min(1, rawX));
    
    const newVal = min + clampedX * (max - min);
    // Immediate update for responsive visualization
    onChange(newVal);
  };

  return (
    <group position={position}>
      <Text position={[-0.18, 0, 0]} fontSize={0.011} color="#94a3b8" anchorX="left" fontWeight="bold">{label}</Text>
      
      <group position={[0.06, 0, 0]} ref={trackRef}>
        {/* Invisible Hit Plane - Enlarged for easier targeting */}
        <mesh 
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
        >
          <planeGeometry args={[trackW + 0.1, 0.08]} />
          <meshBasicMaterial transparent opacity={0} />
        </mesh>

        {/* Visual Track BG */}
        <mesh>
          <planeGeometry args={[trackW, 0.006]} />
          <meshBasicMaterial color="#334155" />
        </mesh>
        
        {/* Progress Bar */}
        <mesh position={[-trackW/2 + (normalized * trackW)/2, 0, 0.001]}>
          <planeGeometry args={[normalized * trackW, 0.006]} />
          <meshBasicMaterial color={isDragging ? "#5eead4" : "#2dd4bf"} />
        </mesh>
        
        {/* Thumb Knob */}
        <mesh position={[-trackW/2 + normalized * trackW, 0, 0.002]}>
          <circleGeometry args={[0.012, 32]} />
          <meshBasicMaterial color={isDragging ? "#ffffff" : "#ccfbf1"} />
        </mesh>

        {/* Digital Value Readout */}
        <Text position={[trackW/2 + 0.04, 0, 0]} fontSize={0.01} color={isDragging ? "#ffffff" : "#94a3b8"} anchorX="left">
          {Number(value ?? 0).toFixed(label.includes('THRES') || label === 'INTERVAL' ? 3 : 1)}
        </Text>
      </group>
    </group>
  );
});

const Dashboard: React.FC<DashboardProps> = ({ state, setState }) => {
  const updateState = useCallback((key: keyof MRIState, val: any) => {
    setState(s => ({ ...s, [key]: val }));
  }, [setState]);

  return (
    <group>
      <Panel title="MRI_SYSTEM_CONTROL // v4.2" width={0.46} height={0.96}>
        
        {/* Diagnostic Modality */}
        <group position={[0, 0.35, 0.01]}>
          <Text fontSize={0.012} color="#94a3b8" position={[-0.19, 0.06, 0]} anchorX="left" fontWeight="bold">DATA_INPUT_CHANNEL</Text>
          <Button 
            text={state.isT1 ? "MODE: T1 (MORPHOLOGY)" : "MODE: T2 (FLUID_PATH)"} 
            width={0.38}
            height={0.08}
            active={state.isT1}
            onClick={() => {
                audioService.playSoftBeep(440);
                updateState('isT1', !state.isT1);
            }} 
          />
        </group>

        {/* Visualization Filters */}
        <group position={[0, 0.12, 0.01]}>
          <DraggableSlider
            label="THRES MIN"
            value={state.thresholdMin}
            min={0.01}
            max={0.99}
            position={[0, 0.10, 0]}
            onChange={(v: number) => setState(s => ({ ...s, thresholdMin: Math.min(v, 0.99) }))}
          />
          <DraggableSlider
            label="INTERVAL"
            value={state.thresholdInterval}
            min={0.005}
            max={1.0}
            position={[0, 0.02, 0]}
            onChange={(v: number) =>
              setState(s => ({ ...s, thresholdInterval: Math.max(0.005, Math.min(v, 1.0 - s.thresholdMin)) }))
            }
          />
          <DraggableSlider label="ALPHA" value={state.opacity} min={0.5} max={15.0} position={[0, -0.06, 0]} onChange={(v: number) => updateState('opacity', v)} />
          <DraggableSlider label="GAIN" value={state.brightness} min={1.0} max={60.0} position={[0, -0.16, 0]} onChange={(v: number) => updateState('brightness', v)} />
        </group>

        {/* Color Map Selection */}
        <group position={[0, -0.22, 0.01]}>
          <Text fontSize={0.012} color="#94a3b8" position={[-0.19, 0.05, 0]} anchorX="left" fontWeight="bold">COLOR_MAP</Text>
          <group position={[0, -0.005, 0]}>
            <Button text={"JET"}     width={0.088} height={0.04} position={[-0.14, 0, 0]} active={state.colorMap==='jet'}     onClick={() => updateState('colorMap','jet')} />
            <Button text={"HSV"}     width={0.088} height={0.04} position={[-0.046, 0, 0]} active={state.colorMap==='hsv'}     onClick={() => updateState('colorMap','hsv')} />
            <Button text={"TURBO"}   width={0.088} height={0.04} position={[0.048, 0, 0]}  active={state.colorMap==='turbo'}   onClick={() => updateState('colorMap','turbo')} />
            <Button text={"INFERNO"} width={0.088} height={0.04} position={[0.142, 0, 0]}  active={state.colorMap==='inferno'} onClick={() => updateState('colorMap','inferno')} />
          </group>
          <group position={[0, -0.055, 0]}>
            <Button 
              text={state.useColorMap ? "GRADIENT: ON" : "GRADIENT: OFF"}
              width={0.38}
              height={0.04}
              active={state.useColorMap}
              onClick={() => updateState('useColorMap', !state.useColorMap)} 
            />
          </group>
        </group>

        {/* Fusion and Enhancement */}
        <group position={[0, -0.34, 0.01]}>
          <Text fontSize={0.012} color="#94a3b8" position={[-0.19, 0.05, 0]} anchorX="left" fontWeight="bold">FUSION_ENHANCE</Text>
          <DraggableSlider label="MIX T1/T2" value={state.mixT1T2} min={0.0} max={1.0} position={[0, -0.02, 0]} onChange={(v: number) => updateState('mixT1T2', v)} />
          <group position={[0, -0.10, 0]}>
            <Button 
              text={state.sharpenEnabled ? "SHARPEN: ON" : "SHARPEN: OFF"}
              width={0.18}
              height={0.04}
              active={state.sharpenEnabled}
              position={[-0.11, 0, 0]}
              onClick={() => updateState('sharpenEnabled', !state.sharpenEnabled)} 
            />
            <DraggableSlider label="SHARPEN" value={state.sharpenStrength} min={0.0} max={2.0} position={[0.08, 0, 0]} onChange={(v: number) => updateState('sharpenStrength', v)} />
          </group>
        </group>

        

        {/* Spatial Clipping Planes */}
        <group position={[0, -0.52, 0.01]}>
           <Text fontSize={0.012} color="#94a3b8" position={[-0.19, 0.05, 0]} anchorX="left" fontWeight="bold">SPATIAL_CLIPPING_ARRAY</Text>
           <Button 
            text={state.enableSlicing ? "PLANAR_CLIP: ENABLED" : "PLANAR_CLIP: BYPASS"} 
            width={0.38}
            height={0.06}
            active={state.enableSlicing}
            onClick={() => {
                audioService.playSoftBeep(261);
                updateState('enableSlicing', !state.enableSlicing);
            }} 
          />
          {state.enableSlicing && (
             <group position={[0, -0.08, 0]}>
                <DraggableSlider label="CLIP X" value={state.sliceX} min={0} max={1} position={[0, 0, 0]} onChange={(v: number) => updateState('sliceX', v)} />
                <DraggableSlider label="CLIP Y" value={state.sliceY} min={0} max={1} position={[0, -0.08, 0]} onChange={(v: number) => updateState('sliceY', v)} />
                <DraggableSlider label="CLIP Z" value={state.sliceZ} min={0} max={1} position={[0, -0.16, 0]} onChange={(v: number) => updateState('sliceZ', v)} />
             </group>
          )}
        </group>
      </Panel>
    </group>
  );
};

const Panel = ({ title, width, height, children }: any) => (
  <group>
    {/* Frame Background */}
    <mesh>
      <planeGeometry args={[width, height]} />
      <meshBasicMaterial color="#020617" transparent opacity={0.97} />
    </mesh>
    {/* Glow Accent */}
    <mesh position={[0, height/2, 0.005]}>
        <planeGeometry args={[width, 0.006]} />
        <meshBasicMaterial color="#2dd4bf" />
    </mesh>
    <Text position={[0, height / 2 - 0.04, 0.01]} fontSize={0.02} color="#2dd4bf" anchorY="top" letterSpacing={0.12} fontWeight="bold">
      {title}
    </Text>
    {children}
  </group>
);

export default Dashboard;
