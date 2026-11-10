import * as THREE from 'three';

// 하늘과 안개가 공유하는 색(선형 색공간). 안개색은 지평선색과 맞춘다.
export const SKY = {
  horizon: new THREE.Color().setRGB(0.046, 0.058, 0.082),
  zenith: new THREE.Color().setRGB(0.008, 0.012, 0.024),
  fog: new THREE.Color().setRGB(0.040, 0.050, 0.070),
};

const VERT = /* glsl */`
varying vec3 vDir;
void main() {
  vDir = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

// 비구름 낀 새벽 하늘. 북쪽(-Z) 전선의 화염이 구름 밑을 붉게 물들이고,
// 의정부를 둘러싼 산 능선이 실루엣으로 깔린다. uFlash는 먼 포격 섬광.
const FRAG = /* glsl */`
uniform float uTime;
uniform float uFlash;
uniform vec3 uFlashDir;
uniform vec3 uHorizon;
uniform vec3 uZenith;
varying vec3 vDir;

float hash(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm(vec2 p) {
  float a = 0.5, s = 0.0;
  for (int i = 0; i < 5; i++) { s += a * noise(p); p = p * 2.03 + 17.1; a *= 0.5; }
  return s;
}

void main() {
  vec3 d = normalize(vDir);
  float h = max(d.y, 0.0);
  vec3 col = mix(uHorizon, uZenith, pow(h, 0.42));

  vec2 az = normalize(d.xz + vec2(1e-5));
  float north = pow(max(dot(az, normalize(vec2(0.25, -1.0))), 0.0), 2.5);   // 전선 방향
  float south = pow(max(dot(az, normalize(vec2(-0.3, 1.0))), 0.0), 4.0);    // 서울 쪽 희미한 도시광
  vec3 fire = vec3(0.42, 0.13, 0.035);

  // 구름 밑면
  vec2 cuv = d.xz / (d.y + 0.22) * 1.4 + vec2(uTime * 0.006, uTime * 0.002);
  float c = fbm(cuv);
  float cloud = smoothstep(0.32, 0.78, c) * smoothstep(-0.02, 0.22, d.y);
  col += cloud * (vec3(0.022, 0.027, 0.040) + fire * 0.20 * north * (1.0 - h) + vec3(0.02, 0.03, 0.05) * south * (1.0 - h));

  // 지평선 화광과 포격 섬광
  col += fire * 0.55 * north * pow(1.0 - h, 7.0);
  col += vec3(0.03, 0.045, 0.07) * south * pow(1.0 - h, 9.0);
  float fl = pow(max(dot(d, normalize(uFlashDir)), 0.0), 18.0);
  col += uFlash * vec3(1.0, 0.72, 0.45) * (fl * 0.9 + cloud * 0.05 * north);

  // 산 능선
  float ridge = 0.035 + 0.060 * noise(az * 2.3 + 5.0) + 0.025 * noise(az * 7.1 + 1.7) + 0.008 * noise(az * 23.0);
  float m = smoothstep(ridge + 0.003, ridge - 0.003, d.y);
  col = mix(col, uHorizon * 0.16 + fire * 0.012 * north, m);

  // 지평선 아래는 안개색으로 가라앉힌다
  col = mix(col, uHorizon * 0.55, smoothstep(0.0, -0.12, d.y));
  gl_FragColor = vec4(col, 1.0);
}`;

export function createSky() {
  const uniforms = {
    uTime: { value: 0 },
    uFlash: { value: 0 },
    uFlashDir: { value: new THREE.Vector3(0.2, 0.06, -1).normalize() },
    uHorizon: { value: SKY.horizon.clone() },
    uZenith: { value: SKY.zenith.clone() },
  };
  const material = new THREE.ShaderMaterial({
    uniforms, vertexShader: VERT, fragmentShader: FRAG,
    side: THREE.BackSide, depthWrite: false, fog: false,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(520, 40, 20), material);
  mesh.name = 'sky';
  mesh.frustumCulled = false;
  mesh.renderOrder = -1000;
  return { mesh, uniforms };
}
