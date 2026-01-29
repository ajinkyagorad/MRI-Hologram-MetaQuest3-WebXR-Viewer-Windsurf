
import * as THREE from 'three';

export const VolumeShader = {
  uniforms: {
    u_data: { value: null },
    u_data2: { value: null },
    u_thresholdMin: { value: 0.08 },
    u_thresholdMax: { value: 0.35 },
    u_opacity: { value: 12.0 },
    u_brightness: { value: 8.0 },
    u_density: { value: 1.0 },
    u_colorMode: { value: 0 },
    u_mixT1T2: { value: 1.0 }, // 1=T1, 0=T2
  },
  vertexShader: `
    varying vec3 vOrigin;
    varying vec3 vDirection;

    void main() {
      // Get camera position in local model space
      vOrigin = (inverse(modelMatrix) * vec4(cameraPosition, 1.0)).xyz;
      // Get direction from camera to vertex in local space
      vDirection = position - vOrigin;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    precision highp float;
    precision highp sampler3D;

    varying vec3 vOrigin;
    varying vec3 vDirection;

    uniform sampler3D u_data;
    uniform sampler3D u_data2;
    uniform float u_thresholdMin;
    uniform float u_thresholdMax;
    uniform float u_opacity;
    uniform float u_brightness;
    uniform float u_density;
    uniform int u_colorMode;
    uniform float u_mixT1T2;
    

    const int MAX_STEPS = 160; 

    // Find intersection of ray with axis-aligned bounding box [-0.5, 0.5]
    vec2 hitBox(vec3 orig, vec3 dir) {
      vec3 box_min = vec3(-0.5);
      vec3 box_max = vec3(0.5);
      vec3 inv_dir = 1.0 / dir;
      vec3 tmin_tmp = (box_min - orig) * inv_dir;
      vec3 tmax_tmp = (box_max - orig) * inv_dir;
      vec3 tmin = min(tmin_tmp, tmax_tmp);
      vec3 tmax = max(tmin_tmp, tmax_tmp);
      float t0 = max(tmin.x, max(tmin.y, tmin.z));
      float t1 = min(tmax.x, min(tmax.y, tmax.z));
      return vec2(t0, t1);
    }

    void main() {
      vec3 rayDir = normalize(vDirection);
      vec2 t_hit = hitBox(vOrigin, rayDir);

      // If we miss the box or it's behind us, discard
      if (t_hit.x > t_hit.y || t_hit.y < 0.0) discard;

      // Start at the entry point (or 0 if camera is inside)
      float t_start = max(t_hit.x, 0.0);
      float t_end = t_hit.y;
      float t_step = (t_end - t_start) / float(MAX_STEPS);

      vec4 accum = vec4(0.0);

      float t = t_start;
      for (int i = 0; i < MAX_STEPS; i++) {
        vec3 localPos = vOrigin + rayDir * t;
        vec3 uvw = localPos + 0.5; // Map [-0.5, 0.5] to [0, 1]
        uvw.y = 1.0 - uvw.y;
        float v1 = texture(u_data, uvw).r;
        float v2 = texture(u_data2, uvw).r;
        float mixed = mix(v2, v1, clamp(u_mixT1T2, 0.0, 1.0));

        float val = mixed;

        // Band-pass thresholding: only integrate values within [min, max]
        if (val >= u_thresholdMin && val <= u_thresholdMax) {
          float denom = max(1e-5, (u_thresholdMax - u_thresholdMin));
          float norm = clamp((val - u_thresholdMin) / denom, 0.0, 1.0);
          // Emphasize contrast near threshold and boost highlights
          float edge = smoothstep(0.0, 1.0, (norm - 0.15) * 1.7);
          float enhanced = pow(norm, 0.4);

          // Map gain to both color and a mild alpha boost
          float gain = max(0.0, u_brightness);
          float alphaGain = 0.5 + 0.5 * clamp(gain, 0.0, 1.0);

          // Front-to-back alpha blending with density scaling for visibility
          float alpha = edge * u_opacity * 0.0020 * max(0.0, u_density) * alphaGain;
          vec3 color = vec3(enhanced) * min(gain, 4.0);

          accum.rgb += (1.0 - accum.a) * color * alpha;
          accum.a += (1.0 - accum.a) * alpha;
        }

        if (accum.a >= 0.95) break;
        t += t_step;
      }

      if (accum.a < 0.01) discard;
      gl_FragColor = vec4(accum.rgb, accum.a);
    }
  `
};
