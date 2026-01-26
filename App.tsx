
import React, { useState, useEffect, Suspense, useMemo, useRef, useCallback } from 'react';
import * as THREE from 'three';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { XR, createXRStore } from '@react-three/xr';
import { Environment, PerspectiveCamera } from '@react-three/drei';
import MRIViewer from './components/MRIViewer';
import Dashboard from './components/Dashboard';
import { MRIState, NiftiData } from './types';
import { fetchNifti } from './services/niftiLoader';

const Headlamp = () => {
  const light = useRef<THREE.PointLight>(null);
  useFrame((state) => {
    if (light.current) light.current.position.copy(state.camera.position);
  });
  return <pointLight ref={light} intensity={15} distance={10} color="#ffffff" />;
};

const ClearAlphaController: React.FC<{ transparent: boolean }> = ({ transparent }) => {
  const { gl } = useThree();
  useEffect(() => {
    gl.setClearColor(0x000000, transparent ? 0 : 1);
  }, [gl, transparent]);
  return null;
};

const InteractiveSuite: React.FC<{ 
  t1Data: NiftiData | null; 
  t2Data: NiftiData | null; 
  state: MRIState;
  setState: React.Dispatch<React.SetStateAction<MRIState>>;
}> = ({ t1Data, t2Data, state, setState }) => {
  return (
    <group position={[0, 1.35, -0.9]}>
      <MRIViewer t1Data={t1Data} t2Data={t2Data} state={state} />
      <group position={[-0.9, 0, 0.4]} rotation={[0, 0.5, 0]}>
        <Dashboard state={state} setState={setState} />
      </group>
    </group>
  );
};

const App: React.FC = () => {
  const [t1Data, setT1Data] = useState<NiftiData | null>(null);
  const [t2Data, setT2Data] = useState<NiftiData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [state, setState] = useState<MRIState>({
    isT1: true,
    thresholdMin: 0.08,
    thresholdInterval: 0.27,
    opacity: 15.0,   // Dense initial visualization
    brightness: 12.0, // Clinical gain setting
    sliceX: 1.0,
    sliceY: 1.0,
    sliceZ: 1.0,
    enableSlicing: false,
    isVolumeRendering: true,
    colorMap: 'jet',
    glareIntensity: 0.4,
    isPassthrough: true,
    useColorMap: true,
  });

  const store = useMemo(() => createXRStore({
    hand: true,
    controller: true,
  }), []);

  const handleEnterXR = useCallback(async () => {
    try {
      const xr: any = (navigator as any).xr;
      if (!xr) {
        setError('WebXR not available. Use a compatible browser (Chrome/Edge) and device.');
        return;
      }

      // If a session is already active, end it first so we can switch modes
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const anyStore: any = store as any;
        await anyStore.session?.end?.();
      } catch {}

      // Passthrough-only mode: attempt immersive-ar only
      const arSupported = await xr.isSessionSupported?.('immersive-ar');
      if (arSupported) {
        await store.enterAR();
        return;
      }
      setError('Passthrough (immersive-ar) not supported on this device/browser. Use Meta Quest Browser with a version that supports AR, over HTTPS.');
      return;
    } catch (err: any) {
      console.warn('XR Session Rejected:', err);
      setError(err?.message || 'WebXR session could not start. Use localhost/HTTPS and a compatible device.');
    }
  }, [store, state.isPassthrough]);

  useEffect(() => {
    async function loadData() {
      try {
        const t1Url = 'https://media.githubusercontent.com/media/ajinkyagorad/MRI/main/TMF_005_t1.nii';
        const t2Url = 'https://media.githubusercontent.com/media/ajinkyagorad/MRI/main/TMF_005_t2.nii';
        const [t1, t2] = await Promise.all([fetchNifti(t1Url), fetchNifti(t2Url)]);
        setT1Data(t1);
        setT2Data(t2);
        setLoading(false);
      } catch (err: any) {
        console.error("Critical System Error:", err);
        setError(err.message || 'Diagnostic Sync Failure');
        setLoading(false);
      }
    }
    loadData();
  }, []);

  return (
    <div className="w-full h-screen bg-black relative overflow-hidden">
      <Canvas 
        gl={{ antialias: true, alpha: true, depth: true, powerPreference: "high-performance" }}
        onCreated={({ gl }) => {
          gl.setClearColor(0x000000, 0);
        }}
      >
        <XR store={store}>
          <Suspense fallback={null}>
            {!loading && !error && (
              <InteractiveSuite t1Data={t1Data} t2Data={t2Data} state={state} setState={setState} />
            )}
            <ClearAlphaController transparent={true} />
            <Headlamp />
            <ambientLight intensity={2.0} />
            {/* No environment in passthrough-only mode */}
          </Suspense>
        </XR>
        <PerspectiveCamera makeDefault position={[0, 1.6, 1.6]} fov={50} />
      </Canvas>

      <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-end pb-16">
        {loading ? (
          <div className="bg-black/90 px-16 py-8 border border-teal-500/30 backdrop-blur-3xl flex flex-col items-center gap-6 shadow-[0_0_100px_rgba(20,184,166,0.1)]">
            <div className="flex gap-2">
              {[0, 1, 2].map(i => (
                <div key={i} className="w-2 h-2 bg-teal-400 rounded-full animate-bounce" style={{ animationDelay: `${i * 0.2}s` }} />
              ))}
            </div>
            <p className="text-teal-400 font-mono text-xs tracking-[0.6em] uppercase">Initializing Neural Matrix</p>
          </div>
        ) : error ? (
           <div className="bg-red-950/20 border border-red-500 px-10 py-5 backdrop-blur-2xl">
              <p className="text-red-400 font-mono text-xs uppercase tracking-widest">{error}</p>
           </div>
        ) : (
          <button 
            onClick={handleEnterXR}
            className="px-20 py-6 bg-teal-500 text-black font-bold rounded-sm text-xs pointer-events-auto hover:bg-white transition-all tracking-[0.5em] uppercase shadow-[0_0_80px_rgba(20,184,166,0.5)] active:scale-95"
          >
            Enter Holographic Suite
          </button>
        )}
      </div>
    </div>
  );
};

export default App;
