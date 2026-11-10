import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { Pass, FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { PLAYER } from '../core/config.js';
import { createSky, SKY } from './sky.js';

// 렌더 모듈: 렌더러·카메라 두 대(월드/총기)·조명·하늘·젖은 노면 반사·후처리.
// 월드는 레이어 0, 1인칭 총기는 레이어 1에 두고 한 프레임에 두 번 그린다.

export const LAYER_WORLD = 0;
export const LAYER_VIEW = 1;

class ScenePass extends Pass {
  constructor(scene, camera, viewCamera) {
    super();
    this.scene = scene; this.camera = camera; this.viewCamera = viewCamera;
    this.needsSwap = false;
    this.viewVisible = true;
  }
  render(renderer, writeBuffer, readBuffer) {
    renderer.setRenderTarget(readBuffer);
    renderer.clear(true, true, false);
    renderer.render(this.scene, this.camera);
    if (this.viewVisible) {
      renderer.clearDepth();
      renderer.render(this.scene, this.viewCamera);
    }
  }
}

const FINAL_VERT = /* glsl */`
varying vec2 vUv;
void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;

const FINAL_FRAG = /* glsl */`
uniform sampler2D tDiffuse;
uniform vec2 uRes;
uniform float uTime, uExposure, uGrain, uVignette, uCA, uSat, uContrast, uDamage, uFlash, uFade;
varying vec2 vUv;

vec3 aces(vec3 x) { return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0); }
float hash12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }

void main() {
  vec2 d = vUv - 0.5;
  float r2 = dot(d, d);
  vec2 off = d * (uCA * r2);
  vec3 col = vec3(texture2D(tDiffuse, vUv + off).r, texture2D(tDiffuse, vUv).g, texture2D(tDiffuse, vUv - off).b);
  col = aces(col * uExposure);

  float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
  col = mix(vec3(l), col, uSat);
  col = mix(col, col * col * (3.0 - 2.0 * col), uContrast);
  // 스플릿 토닝: 암부는 청록, 명부는 따뜻하게
  col += (1.0 - smoothstep(0.0, 0.4, l)) * vec3(-0.004, 0.003, 0.012);
  col += smoothstep(0.55, 1.0, l) * vec3(0.012, 0.004, -0.010);

  col *= 1.0 - uVignette * smoothstep(0.16, 0.9, r2 * 2.2);
  float edge = smoothstep(0.06, 0.5, r2);
  col = mix(col, vec3(0.50, 0.015, 0.0), clamp(uDamage, 0.0, 1.0) * edge * 0.8);
  col += uFlash;
  col *= 1.0 - uFade;

  col = max(col, 0.0);
  col = mix(col * 12.92, 1.055 * pow(col, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, col));
  col += (hash12(vUv * uRes + fract(uTime) * 517.0) - 0.5) * uGrain;
  gl_FragColor = vec4(col, 1.0);
}`;

class FinalPass extends Pass {
  constructor() {
    super();
    this.uniforms = {
      tDiffuse: { value: null }, uRes: { value: new THREE.Vector2(1, 1) }, uTime: { value: 0 },
      uExposure: { value: 1.25 }, uGrain: { value: 0.045 }, uVignette: { value: 0.42 }, uCA: { value: 0.012 },
      uSat: { value: 1.06 }, uContrast: { value: 0.22 }, uDamage: { value: 0 }, uFlash: { value: 0 }, uFade: { value: 0 },
    };
    this.material = new THREE.ShaderMaterial({ uniforms: this.uniforms, vertexShader: FINAL_VERT, fragmentShader: FINAL_FRAG, depthTest: false, depthWrite: false });
    this.fsQuad = new FullScreenQuad(this.material);
  }
  render(renderer, writeBuffer, readBuffer) {
    this.uniforms.tDiffuse.value = readBuffer.texture;
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    this.fsQuad.render(renderer);
  }
  setSize(w, h) { this.uniforms.uRes.value.set(w, h); }
}

// 젖은 노면용 평면 반사: y=0 평면에 대칭인 가상 카메라로 월드를 한 번 더 그린다.
function createReflection(G, renderer, scene, camera) {
  const rt = new THREE.WebGLRenderTarget(16, 16, { type: THREE.HalfFloatType, depthBuffer: true });
  rt.texture.generateMipmaps = true;
  rt.texture.minFilter = THREE.LinearMipmapLinearFilter;
  rt.texture.magFilter = THREE.LinearFilter;
  const vcam = new THREE.PerspectiveCamera();
  vcam.layers.set(LAYER_WORLD);
  const matrix = new THREE.Matrix4();
  const uniforms = { tRefl: { value: rt.texture }, uReflMatrix: { value: matrix }, uReflStrength: { value: 1 } };
  const normal = new THREE.Vector3(0, 1, 0), planePos = new THREE.Vector3(0, 0.012, 0);
  const camPos = new THREE.Vector3(), view = new THREE.Vector3(), look = new THREE.Vector3(), target = new THREE.Vector3();
  const rot = new THREE.Matrix4(), plane = new THREE.Plane(), clip = new THREE.Vector4(), q = new THREE.Vector4();
  const hidden = [];
  let enabled = true;

  return {
    uniforms, rt, hidden,
    get enabled() { return enabled; },
    set enabled(v) { enabled = v; uniforms.uReflStrength.value = v ? 1 : 0; },
    setSize(w, h) { rt.setSize(Math.max(8, w | 0), Math.max(8, h | 0)); },
    render() {
      if (!enabled) return false;
      camPos.setFromMatrixPosition(camera.matrixWorld);
      if (camPos.y <= planePos.y + 0.02) return false;
      view.subVectors(planePos, camPos).reflect(normal).negate().add(planePos);
      rot.extractRotation(camera.matrixWorld);
      look.set(0, 0, -1).applyMatrix4(rot).add(camPos);
      target.subVectors(planePos, look).reflect(normal).negate().add(planePos);
      vcam.position.copy(view);
      vcam.up.set(0, 1, 0).applyMatrix4(rot).reflect(normal);
      vcam.lookAt(target);
      vcam.near = camera.near; vcam.far = camera.far;
      vcam.updateMatrixWorld();
      vcam.projectionMatrix.copy(camera.projectionMatrix);
      matrix.set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1);
      matrix.multiply(vcam.projectionMatrix).multiply(vcam.matrixWorldInverse);
      // 평면 아래를 잘라내는 비스듬한 근평면(Lengyel)
      plane.setFromNormalAndCoplanarPoint(normal, planePos).applyMatrix4(vcam.matrixWorldInverse);
      clip.set(plane.normal.x, plane.normal.y, plane.normal.z, plane.constant);
      const e = vcam.projectionMatrix.elements;
      q.set((Math.sign(clip.x) + e[8]) / e[0], (Math.sign(clip.y) + e[9]) / e[5], -1, (1 + e[10]) / e[14]);
      clip.multiplyScalar(2 / clip.dot(q));
      e[2] = clip.x; e[6] = clip.y; e[10] = clip.z + 1 - 0.003; e[14] = clip.w;

      for (const o of hidden) o.visible = false;
      renderer.setRenderTarget(rt);
      renderer.clear(true, true, false);
      renderer.render(scene, vcam);
      for (const o of hidden) o.visible = true;
      return true;
    },
    // MeshStandardMaterial에 반사 항을 끼워 넣는다.
    patch(material, strength = 1) {
      material.onBeforeCompile = (shader) => {
        shader.uniforms.tRefl = uniforms.tRefl;
        shader.uniforms.uReflMatrix = uniforms.uReflMatrix;
        shader.uniforms.uReflStrength = uniforms.uReflStrength;
        shader.uniforms.uReflGain = { value: strength };
        shader.vertexShader = shader.vertexShader
          .replace('#include <common>', '#include <common>\nuniform mat4 uReflMatrix;\nvarying vec4 vReflPos;')
          .replace('#include <project_vertex>', '#include <project_vertex>\nvReflPos = uReflMatrix * modelMatrix * vec4(transformed, 1.0);');
        shader.fragmentShader = shader.fragmentShader
          .replace('#include <common>', '#include <common>\nuniform sampler2D tRefl;\nuniform float uReflStrength;\nuniform float uReflGain;\nvarying vec4 vReflPos;')
          .replace('#include <opaque_fragment>', /* glsl */`
          {
            vec2 ruv = vReflPos.xy / max(vReflPos.w, 1e-4);
            vec2 bend = vec2(0.0);
            #ifdef USE_NORMALMAP_TANGENTSPACE
              bend = (texture2D(normalMap, vNormalMapUv).xy * 2.0 - 1.0) * normalScale;
            #endif
            ruv += bend * 0.03;
            float gloss = 1.0 - roughnessFactor;
            vec3 refl = textureLod(tRefl, clamp(ruv, 0.001, 0.999), roughnessFactor * 7.0).rgb;
            float cosT = clamp(dot(normalize(vViewPosition), normal), 0.0, 1.0);
            float fres = 0.035 + 0.965 * pow(1.0 - cosT, 4.0);
            outgoingLight += refl * fres * gloss * gloss * uReflStrength * uReflGain;
          }
          #include <opaque_fragment>`);
      };
      material.customProgramCacheKey = () => 'corridor-wet-' + strength;
      material.userData.reflective = true;      // 반사 패스에서는 이 재질의 메시를 숨긴다(자기 참조 방지)
      material.needsUpdate = true;
    },
  };
}

export function createRender(G) {
  const canvas = document.getElementById('view');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, stencil: false, powerPreference: 'high-performance' });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.autoClear = false;
  renderer.setClearColor(0x000000, 1);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.shadowMap.autoUpdate = false;
  renderer.info.autoReset = false;
  // 셰이더 컴파일 실패는 짧게 줄여 기록한다(기본 출력은 소스 전체라 너무 길다).
  renderer.debug.onShaderError = (gl, program, vs, fs) => {
    const logs = [gl.getProgramInfoLog(program), gl.getShaderInfoLog(vs), gl.getShaderInfoLog(fs)].filter(Boolean).join(' | ');
    console.error('[render] 셰이더 컴파일 실패: ' + logs.trim().slice(0, 600));
  };

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x000000, 0.0155);
  scene.fog.color.copy(SKY.fog);

  const camera = new THREE.PerspectiveCamera(PLAYER.fov, 16 / 9, 0.08, 700);
  camera.rotation.order = 'YXZ';
  camera.layers.set(LAYER_WORLD);
  scene.add(camera);
  const viewCamera = new THREE.PerspectiveCamera(PLAYER.viewFov, 16 / 9, 0.01, 12);
  viewCamera.layers.set(LAYER_VIEW);
  scene.add(viewCamera);

  const sky = createSky();
  scene.add(sky.mesh);

  // ---- 조명: 하늘빛 + 구름 너머 달빛(그림자) ----
  const lights = [];
  const addLight = (light) => { light.layers.enable(LAYER_VIEW); scene.add(light); lights.push(light); return light; };
  const hemi = addLight(new THREE.HemisphereLight(new THREE.Color().setRGB(0.22, 0.29, 0.44), new THREE.Color().setRGB(0.05, 0.048, 0.055), 1.0));
  const moon = new THREE.DirectionalLight(new THREE.Color().setRGB(0.56, 0.68, 0.98), 0.62);
  moon.name = 'moon';
  moon.position.set(42, 78, 30);
  moon.target.position.set(0, 0, 0);
  moon.castShadow = true;
  const shadowSize = () => Math.min(G.quality.shadow || 2048, renderer.capabilities.maxTextureSize);
  moon.shadow.mapSize.set(shadowSize(), shadowSize());
  Object.assign(moon.shadow.camera, { left: -84, right: 84, top: 66, bottom: -66, near: 8, far: 210 });
  moon.shadow.camera.updateProjectionMatrix();
  moon.shadow.bias = -0.0004;
  moon.shadow.normalBias = 0.05;
  moon.shadow.radius = 2.5;
  addLight(moon);
  scene.add(moon.target);

  // 총구 화염·폭발용 순간 조명 풀
  const flashes = [];
  for (let i = 0; i < 4; i++) {
    const l = addLight(new THREE.PointLight(0xffffff, 0, 14, 2));
    l.userData = { ttl: 0, dur: 1, peak: 0 };
    flashes.push(l);
  }
  function flash(pos, color = 0xffc070, intensity = 30, distance = 12, ttl = 0.06) {
    let best = flashes[0];
    for (const l of flashes) { if (l.userData.ttl <= 0) { best = l; break; } if (l.userData.ttl < best.userData.ttl) best = l; }
    best.position.copy(pos); best.color.set(color); best.distance = distance; best.intensity = intensity;
    best.userData.ttl = ttl; best.userData.dur = ttl; best.userData.peak = intensity;
  }

  // ---- 환경맵: 하늘을 PMREM으로 구워 금속·젖은 면의 간접 반사에 쓴다 ----
  function buildEnvironment() {
    const pmrem = new THREE.PMREMGenerator(renderer);
    const envScene = new THREE.Scene();
    const envSky = createSky();
    envScene.add(envSky.mesh);
    const glow = (color, x, y, z, w, h) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide }));
      m.position.set(x, y, z); m.lookAt(0, 0, 0); envScene.add(m);
    };
    // 간판과 가로등 불빛을 대신하는 발광 판
    glow(new THREE.Color().setRGB(2.4, 0.5, 0.35), -40, 6, -18, 10, 3);
    glow(new THREE.Color().setRGB(0.4, 1.6, 2.2), 36, 5, 16, 9, 3);
    glow(new THREE.Color().setRGB(2.2, 1.5, 0.7), 10, 9, -30, 6, 4);
    glow(new THREE.Color().setRGB(1.6, 1.8, 1.6), -14, 4, 28, 8, 3);
    const rt = pmrem.fromScene(envScene, 0.03, 0.1, 1000);
    scene.environment = rt.texture;
    scene.environmentIntensity = 0.55;
    pmrem.dispose();
    envSky.mesh.geometry.dispose(); envSky.mesh.material.dispose();
  }
  try { buildEnvironment(); } catch (err) { console.error('[render] 환경맵 생성 실패: ' + (err && err.stack || err)); }

  // ---- 후처리 체인 ----
  const size = { w: 16, h: 16, bw: 16, bh: 16, pr: 1 };
  const target = new THREE.WebGLRenderTarget(16, 16, { type: THREE.HalfFloatType, samples: G.quality.msaa | 0, depthBuffer: true });
  const composer = new EffectComposer(renderer, target);
  const scenePass = new ScenePass(scene, camera, viewCamera);
  const bloomPass = new UnrealBloomPass(new THREE.Vector2(16, 16), 0.5, 0.55, 1.0);
  bloomPass.enabled = G.quality.bloom !== false;
  const finalPass = new FinalPass();
  composer.addPass(scenePass);
  composer.addPass(bloomPass);
  composer.addPass(finalPass);

  const reflection = G.quality.reflect > 0 ? createReflection(G, renderer, scene, camera) : null;

  function resize() {
    const app = document.getElementById('app');
    const w = Math.max(16, app.clientWidth), h = Math.max(16, app.clientHeight);
    const pr = Math.min(window.devicePixelRatio || 1, 1.5) * (G.quality.scale || 1);
    size.w = w; size.h = h; size.pr = pr;
    size.bw = Math.max(16, Math.round(w * pr)); size.bh = Math.max(16, Math.round(h * pr));
    renderer.setPixelRatio(pr);
    renderer.setSize(w, h, false);
    composer.setPixelRatio(1);
    composer.setSize(size.bw, size.bh);
    if (reflection) reflection.setSize(size.bw * G.quality.reflect, size.bh * G.quality.reflect);
    camera.aspect = viewCamera.aspect = w / h;
    camera.updateProjectionMatrix();
    viewCamera.updateProjectionMatrix();
  }
  window.addEventListener('resize', resize);
  resize();

  // 품질 설정을 실행 중에 바꾼다(텍스처 해상도는 다시 불러올 때 적용).
  function applyQuality(q) {
    G.quality = q;
    bloomPass.enabled = q.bloom !== false;
    const s = shadowSize();
    if (moon.shadow.mapSize.x !== s) {
      moon.shadow.mapSize.set(s, s);
      if (moon.shadow.map) { moon.shadow.map.dispose(); moon.shadow.map = null; }
    }
    for (const rtarget of [composer.renderTarget1, composer.renderTarget2]) {
      if (rtarget.samples !== (q.msaa | 0)) { rtarget.samples = q.msaa | 0; rtarget.dispose(); }
    }
    if (reflection) reflection.enabled = q.reflect > 0;
    resize();
  }

  const post = finalPass.uniforms;
  const state = { damage: 0, flash: 0, fade: 0, skyFlash: 0, nextSkyFlash: 3, viewVisible: true };
  const tmp = new THREE.Vector3();

  function frame(dt) {
    const t = G.time.t;
    // 먼 포격 섬광
    state.nextSkyFlash -= dt;
    if (state.nextSkyFlash <= 0) {
      state.nextSkyFlash = 3.5 + Math.random() * 9;
      state.skyFlash = 0.6 + Math.random() * 0.9;
      const a = -Math.PI / 2 + (Math.random() - 0.5) * 1.5;   // 북쪽 호
      sky.uniforms.uFlashDir.value.set(Math.cos(a), 0.03 + Math.random() * 0.05, Math.sin(a)).normalize();
      G.events.emit('sky/flash', { intensity: state.skyFlash, dir: sky.uniforms.uFlashDir.value });
    }
    state.skyFlash = Math.max(0, state.skyFlash - dt * 3.2);
    sky.uniforms.uFlash.value = state.skyFlash * state.skyFlash;
    sky.uniforms.uTime.value = t;
    sky.mesh.position.copy(camera.position);

    for (const l of flashes) {
      const u = l.userData;
      if (u.ttl > 0) { u.ttl -= dt; l.intensity = u.ttl > 0 ? u.peak * (u.ttl / u.dur) : 0; }
    }

    state.damage = Math.max(0, state.damage - dt * 0.9);
    state.flash = Math.max(0, state.flash - dt * 3.5);
    post.uDamage.value = state.damage;
    post.uFlash.value = state.flash;
    post.uFade.value = state.fade;
    post.uTime.value = t;

    camera.updateMatrixWorld();
    viewCamera.position.copy(camera.position);
    viewCamera.quaternion.copy(camera.quaternion);
    viewCamera.updateMatrixWorld();
    scenePass.viewVisible = state.viewVisible;

    renderer.info.reset();
    renderer.shadowMap.needsUpdate = true;
    if (reflection) reflection.render();
    composer.render(dt);
  }

  // 총기 좌표(뷰 카메라 기준 월드)를 월드 카메라에서 같은 화면 위치가 되는 월드 좌표로 옮긴다.
  function viewToWorld(worldPos, depth = 1.4, out = new THREE.Vector3()) {
    tmp.copy(worldPos).project(viewCamera);
    out.set(tmp.x, tmp.y, 0.5).unproject(camera);
    out.sub(camera.position).normalize().multiplyScalar(depth).add(camera.position);
    return out;
  }

  return {
    renderer, scene, camera, viewCamera, sky, hemi, moon, composer, bloomPass, post, state, reflection, size,
    addLight, flash, resize, applyQuality, frame, viewToWorld,
    get exposure() { return post.uExposure.value; },
    set exposure(v) { post.uExposure.value = v; },
    stats() {
      const i = renderer.info;
      return { calls: i.render.calls, tris: i.render.triangles, geometries: i.memory.geometries, textures: i.memory.textures, buffer: `${size.bw}x${size.bh}` };
    },
  };
}
