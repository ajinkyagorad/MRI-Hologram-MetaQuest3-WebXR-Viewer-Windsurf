
export interface MRIState {
  isT1: boolean;
  thresholdMin: number;
  thresholdInterval: number;
  opacity: number;
  brightness: number;
  sliceX: number;
  sliceY: number;
  sliceZ: number;
  enableSlicing: boolean;
  isVolumeRendering: boolean;
  colorMap: 'jet' | 'hsv' | 'turbo' | 'inferno';
  glareIntensity: number;
  isPassthrough: boolean;
  useColorMap: boolean;
  mixT1T2: number; // 0 = T2, 1 = T1
  sharpenEnabled: boolean;
  sharpenStrength: number; // e.g., 0..2
}

export interface NiftiData {
  data: Uint8Array;
  dims: number[];
  pixDims: number[]; // Physical spacing in mm
  aspectRatio: [number, number, number];
  header: any;
}
