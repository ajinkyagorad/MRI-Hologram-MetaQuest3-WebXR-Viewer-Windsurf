
import { NiftiData } from '../types';

export async function fetchNifti(url: string): Promise<NiftiData> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Fetch failed: ${response.status}`);
  
  const buffer = await response.arrayBuffer();
  const view = new DataView(buffer);
  
  // NIfTI-1 standard: Header is 348 bytes
  const isLittleEndian = view.getInt32(0, true) === 348;
  
  // Dimensions (offset 40)
  const dims = [
    view.getInt16(42, isLittleEndian), 
    view.getInt16(44, isLittleEndian), 
    view.getInt16(46, isLittleEndian)
  ];
  
  // Physical spacing (offset 76)
  const pixDims = [
    view.getFloat32(80, isLittleEndian), // pixdim[1]
    view.getFloat32(84, isLittleEndian), // pixdim[2]
    view.getFloat32(88, isLittleEndian)  // pixdim[3]
  ];

  // Data Type (offset 70) and Voxel Offset (offset 108)
  const dataType = view.getInt16(70, isLittleEndian);
  const voxOffset = Math.floor(view.getFloat32(108, isLittleEndian));

  // Intensity scaling (offset 112, 116)
  const sclSlope = view.getFloat32(112, isLittleEndian) || 1.0;
  const sclInter = view.getFloat32(116, isLittleEndian) || 0.0;

  const numVoxels = dims[0] * dims[1] * dims[2];
  let rawValues = new Float32Array(numVoxels);

  // Helper to read data based on type
  if (dataType === 2) { // UINT8
    const data = new Uint8Array(buffer, voxOffset, numVoxels);
    for (let i = 0; i < numVoxels; i++) rawValues[i] = data[i] * sclSlope + sclInter;
  } else if (dataType === 4) { // INT16
    const data = new Int16Array(buffer, voxOffset, numVoxels);
    for (let i = 0; i < numVoxels; i++) rawValues[i] = data[i] * sclSlope + sclInter;
  } else if (dataType === 16) { // FLOAT32
    const data = new Float32Array(buffer, voxOffset, numVoxels);
    for (let i = 0; i < numVoxels; i++) rawValues[i] = data[i] * sclSlope + sclInter;
  } else if (dataType === 512) { // UINT16
    const data = new Uint16Array(buffer, voxOffset, numVoxels);
    for (let i = 0; i < numVoxels; i++) rawValues[i] = data[i] * sclSlope + sclInter;
  } else {
    throw new Error(`Unsupported NIfTI DataType: ${dataType}`);
  }

  // Calculate Contrast Range (Percentile-based to remove noise)
  const sorted = new Float32Array(Math.min(rawValues.length, 10000));
  const stride = Math.floor(rawValues.length / sorted.length);
  for(let i=0; i<sorted.length; i++) sorted[i] = rawValues[i * stride];
  sorted.sort();
  
  const minVal = sorted[Math.floor(sorted.length * 0.05)]; 
  const maxVal = sorted[Math.floor(sorted.length * 0.995)];
  const range = maxVal - minVal || 1.0;

  // Normalize to 0-255 for Data3DTexture
  const uint8Data = new Uint8Array(numVoxels);
  for (let i = 0; i < numVoxels; i++) {
    const val = (rawValues[i] - minVal) / range;
    uint8Data[i] = Math.max(0, Math.min(255, Math.floor(val * 255)));
  }

  // Calculate aspect ratio for spatial scaling
  const maxDim = Math.max(dims[0] * pixDims[0], dims[1] * pixDims[1], dims[2] * pixDims[2]);
  const aspectRatio: [number, number, number] = [
    (dims[0] * pixDims[0]) / maxDim,
    (dims[1] * pixDims[1]) / maxDim,
    (dims[2] * pixDims[2]) / maxDim
  ];

  console.log(`[MRI] Sync: ${dims.join('x')} | Physical: ${pixDims.map(d=>d.toFixed(2)).join('x')}mm | Range: ${minVal.toFixed(2)}-${maxVal.toFixed(2)}`);

  return { 
    data: uint8Data, 
    dims, 
    pixDims, 
    aspectRatio,
    header: { dataType, min: minVal, max: maxVal } 
  };
}
