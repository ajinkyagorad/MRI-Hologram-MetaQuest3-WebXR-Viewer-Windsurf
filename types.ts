
export interface MRIState {
  isT1: boolean;
  thresholdMin: number;
  thresholdInterval: number;
  opacity: number;
  brightness: number;
  brightnessFine: number;
  isVolumeRendering: boolean;
  glareIntensity: number;
  isPassthrough: boolean;
  mixT1T2: number; // 0 = T2, 1 = T1
  dashboardPos: [number, number, number];
}

export interface NiftiData {
  data: Uint8Array;
  dims: number[];
  pixDims: number[]; // Physical spacing in mm
  aspectRatio: [number, number, number];
  header: any;
}
