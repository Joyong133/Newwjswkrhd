import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/**
 * 움직이지 않는 메시(userData.static === true)를 합쳐서 드로우콜을 줄인다.
 * - 텍스처가 있는 머티리얼: 같은 머티리얼끼리 합침
 * - 텍스처 없는 불투명 MeshStandardMaterial: 색을 정점 색으로 구워서
 *   거칠기/금속성 구간이 같은 것끼리 하나의 머티리얼로 합침
 * 퀘스트 같은 모바일 GPU에서 큰 차이가 난다.
 */
const vcMaterials = new Map();

function vertexColorBucket(m) {
  if (!m.isMeshStandardMaterial || m.isMeshPhysicalMaterial) return null;
  if (m.map || m.transparent || m.alphaMap || m.normalMap || m.side !== THREE.FrontSide) return null;
  if (m.emissive && (m.emissive.r + m.emissive.g + m.emissive.b) * m.emissiveIntensity > 0.001) return null;
  if (m.onBeforeCompile && m.onBeforeCompile.toString() !== THREE.Material.prototype.onBeforeCompile.toString()) return null;
  const r = Math.round(m.roughness * 10) / 10;
  const mt = Math.round(m.metalness * 4) / 4;
  return { key: `vc|${r}|${mt}|${m.envMapIntensity ?? 1}`, roughness: r, metalness: mt, envMapIntensity: m.envMapIntensity ?? 1 };
}

function sharedVC(bucket) {
  if (!vcMaterials.has(bucket.key)) {
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: bucket.roughness, metalness: bucket.metalness, envMapIntensity: bucket.envMapIntensity });
    mat.name = bucket.key;
    vcMaterials.set(bucket.key, mat);
  }
  return vcMaterials.get(bucket.key);
}

export function mergeStatic(root, target) {
  root.updateMatrixWorld(true);
  const groups = new Map();
  const toRemove = [];
  root.traverse((o) => {
    if (!o.isMesh || !o.userData.static || o.isInstancedMesh || o.isSkinnedMesh) return;
    if (Array.isArray(o.material)) return;
    const bucket = vertexColorBucket(o.material);
    const material = bucket ? sharedVC(bucket) : o.material;
    const key = `${bucket ? bucket.key : o.material.uuid}|${o.castShadow ? 1 : 0}|${o.receiveShadow ? 1 : 0}`;
    if (!groups.has(key)) groups.set(key, { material, cast: o.castShadow, receive: o.receiveShadow, vc: !!bucket, geos: [] });
    let g = o.geometry.clone();
    g.applyMatrix4(o.matrixWorld);
    // 합칠 수 있도록 속성 맞추기
    for (const name of Object.keys(g.attributes)) {
      if (!['position', 'normal', 'uv'].includes(name)) g.deleteAttribute(name);
    }
    if (!g.attributes.normal) g.computeVertexNormals();
    if (!g.attributes.uv) {
      g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    }
    if (g.index) g = g.toNonIndexed();
    g.morphAttributes = {};
    if (bucket) {
      const c = o.material.color;
      const n = g.attributes.position.count;
      const col = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) {
        col[i * 3] = c.r;
        col[i * 3 + 1] = c.g;
        col[i * 3 + 2] = c.b;
      }
      g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    }
    groups.get(key).geos.push(g);
    toRemove.push(o);
  });
  for (const o of toRemove) o.parent?.remove(o);
  let count = 0;
  for (const { material, cast, receive, geos } of groups.values()) {
    const merged = mergeGeometries(geos, false);
    if (!merged) continue;
    merged.computeBoundingSphere();
    merged.computeBoundingBox();
    const mesh = new THREE.Mesh(merged, material);
    mesh.castShadow = cast;
    mesh.receiveShadow = receive;
    mesh.matrixAutoUpdate = false;
    mesh.name = `static:${material.name || material.type}`;
    target.add(mesh);
    count++;
  }
  return { merged: toRemove.length, drawCalls: count };
}
