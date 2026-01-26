
import * as THREE from 'three';

export const VolumeShader = {
  uniforms: {
    u_data: { value: null },
    u_thresholdMin: { value: 0.08 },
    u_thresholdMax: { value: 0.35 },
    u_opacity: { value: 12.0 },
    u_brightness: { value: 8.0 },
    u_clipping: { value: false },
    u_clipX: { value: 1.0 },
    u_clipY: { value: 1.0 },
    u_clipZ: { value: 1.0 },
    u_colorMode: { value: 0 },
    u_colorMap: { value: 0 },
    u_useColorMap: { value: true }
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
    uniform float u_thresholdMin;
    uniform float u_thresholdMax;
    uniform float u_opacity;
    uniform float u_brightness;
    uniform bool u_clipping;
    uniform float u_clipX;
    uniform float u_clipY;
    uniform float u_clipZ;
    uniform int u_colorMode;
    uniform int u_colorMap;
    uniform bool u_useColorMap;

    const int MAX_STEPS = 160; 

    vec3 hsv2rgb(vec3 c) {
      vec4 K = vec4(1.0, 2.0/3.0, 1.0/3.0, 3.0);
      vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
      return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
    }

    vec3 colorMapFn(int mapId, float t) {
      t = clamp(t, 0.0, 1.0);
      if (mapId == 0) {
        // jet (blue -> cyan -> yellow -> red)
        float r = clamp(1.5 - abs(4.0*(t-0.75)), 0.0, 1.0);
        float g = clamp(1.5 - abs(4.0*(t-0.50)), 0.0, 1.0);
        float b = clamp(1.5 - abs(4.0*(t-0.25)), 0.0, 1.0);
        return vec3(r,g,b);
      } else if (mapId == 1) {
        // hsv rainbow (full hue sweep)
        return hsv2rgb(vec3(t, 1.0, 1.0));
      } else if (mapId == 2) {
        // turbo (approximation)
        // Simple vibrant gradient approximation
        vec3 c1 = vec3(0.19, 0.07, 0.23); // deep purple
        vec3 c2 = vec3(0.07, 0.62, 0.95); // cyan-blue
        vec3 c3 = vec3(0.90, 0.90, 0.10); // yellow
        vec3 c4 = vec3(0.80, 0.20, 0.10); // red-orange
        vec3 a = mix(c1, c2, smoothstep(0.0, 0.35, t));
        vec3 b = mix(c3, c4, smoothstep(0.65, 1.0, t));
        return mix(a, b, smoothstep(0.35, 0.65, t));
      } else if (mapId == 3) {
        // inferno (approximation)
        vec3 d = vec3(0.0, 0.0, 0.0);
        vec3 e = vec3(0.22, 0.02, 0.19);
        vec3 f = vec3(0.88, 0.19, 0.12);
        vec3 g = vec3(1.00, 0.98, 0.80);
        vec3 a = mix(d, e, smoothstep(0.0, 0.25, t));
        vec3 b = mix(f, g, smoothstep(0.55, 1.0, t));
        return mix(a, b, smoothstep(0.25, 0.55, t));
      }
      // fallback grayscale
      return vec3(t);
    }

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
        // Clipping logic
        bool isClipped = u_clipping && (uvw.x > u_clipX || uvw.y > u_clipY || uvw.z > u_clipZ);
        
        if (!isClipped) {
          float val = texture(u_data, uvw).r;

          // Band-pass thresholding: only integrate values within [min, max]
          if (val >= u_thresholdMin && val <= u_thresholdMax) {
            float denom = max(1e-5, (u_thresholdMax - u_thresholdMin));
            float norm = clamp((val - u_thresholdMin) / denom, 0.0, 1.0);
            // Emphasize contrast near threshold and boost highlights
            float edge = smoothstep(0.0, 1.0, (norm - 0.15) * 1.7);
            float enhanced = pow(norm, 0.4);

            // Front-to-back alpha blending with slightly higher per-step opacity
            float alpha = edge * u_opacity * 0.0020;
            vec3 base = u_useColorMap ? colorMapFn(u_colorMap, enhanced) : vec3(enhanced);
            vec3 color = base * u_brightness;

            accum.rgb += (1.0 - accum.a) * color * alpha;
            accum.a += (1.0 - accum.a) * alpha;
          }
        }

        if (accum.a >= 0.95) break;
        t += t_step;
      }

      if (accum.a < 0.01) discard;
      gl_FragColor = vec4(accum.rgb, accum.a);
    }
  `
};
