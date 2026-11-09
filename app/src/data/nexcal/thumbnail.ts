/**
 * Nexcal — 3D model thumbnail renderer.
 *
 * Ported line-for-line from the standalone Nexcal calculator
 * (`Nexcal - Price Calculator/assets/thumbnail.js`). Software rasterizer (no
 * WebGL/Three.js dependency): projects the parsed triangle mesh to an
 * isometric 3/4 view, flat-shades each face in grey against a white
 * background. Browser-only (canvas).
 */

import type { Triangle, UpAxis, Vec3 } from "./geometry";

const YAW = (45 * Math.PI) / 180;
const PITCH = Math.atan(1 / Math.sqrt(2)); // classic isometric tilt
const MAX_FACES = 20000; // stride-sample denser meshes for speed

const LIGHT = normalize3([0.35, 0.55, 0.78]);
const AMBIENT = 0.42;
const DIFFUSE = 0.55;
const BASE_GREY = 200; // flat grey before shading

function normalize3(v: Vec3): Vec3 {
  const len = Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]) || 1;
  return [v[0] / len, v[1] / len, v[2] / len];
}

/** Remap raw file axes so the chosen up-axis becomes vertical. */
function remapUp(p: Vec3, upAxis: UpAxis): Vec3 {
  const x = p[0],
    y = p[1],
    z = p[2];
  if (upAxis === "X") return [y, x, z];
  if (upAxis === "-X") return [y, -x, z];
  if (upAxis === "Y") return [x, y, z];
  if (upAxis === "-Y") return [x, -y, z];
  if (upAxis === "-Z") return [x, -z, -y];
  return [x, z, -y]; // Z up (default)
}

function isoTransform(p: Vec3): Vec3 {
  const x = p[0],
    y = p[1],
    z = p[2];
  // yaw around the up axis
  const x1 = x * Math.cos(YAW) + z * Math.sin(YAW);
  const y1 = y;
  const z1 = -x * Math.sin(YAW) + z * Math.cos(YAW);
  // pitch for the isometric tilt
  const x2 = x1;
  const y2 = y1 * Math.cos(PITCH) - z1 * Math.sin(PITCH);
  const z2 = y1 * Math.sin(PITCH) + z1 * Math.cos(PITCH);
  return [x2, y2, z2];
}

function sub(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}
function cross(a: Vec3, b: Vec3): Vec3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

export function renderToCanvas(
  canvas: HTMLCanvasElement,
  triangles: Triangle[],
  upAxis: UpAxis,
): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const w = canvas.width;
  const h = canvas.height;

  ctx.fillStyle = "#FFFFFF";
  ctx.fillRect(0, 0, w, h);

  if (!triangles || triangles.length === 0) return;

  const stride = Math.max(1, Math.floor(triangles.length / MAX_FACES));

  // Transform every vertex once; keep faces as index triples into pts[].
  const pts: Vec3[] = [];
  const faces: number[] = [];
  for (let i = 0; i < triangles.length; i += stride) {
    const tri = triangles[i];
    const a = isoTransform(remapUp(tri[0], upAxis));
    const b = isoTransform(remapUp(tri[1], upAxis));
    const c = isoTransform(remapUp(tri[2], upAxis));
    const base = pts.length;
    pts.push(a, b, c);
    faces.push(base);
  }

  if (faces.length === 0) return;

  // Fit projected (x,y) into the canvas with padding.
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (const p of pts) {
    if (p[0] < minX) minX = p[0];
    if (p[0] > maxX) maxX = p[0];
    if (p[1] < minY) minY = p[1];
    if (p[1] > maxY) maxY = p[1];
  }
  const spanX = Math.max(maxX - minX, 1e-6);
  const spanY = Math.max(maxY - minY, 1e-6);
  const padding = 0.14;
  const scale = Math.min((w * (1 - padding * 2)) / spanX, (h * (1 - padding * 2)) / spanY);
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;

  function toScreen(p: Vec3): [number, number] {
    return [w / 2 + (p[0] - cx) * scale, h / 2 - (p[1] - cy) * scale];
  }

  // Sort faces back-to-front (painter's algorithm) by average depth.
  faces.sort((fa, fb) => {
    const da = (pts[fa][2] + pts[fa + 1][2] + pts[fa + 2][2]) / 3;
    const db = (pts[fb][2] + pts[fb + 1][2] + pts[fb + 2][2]) / 3;
    return da - db;
  });

  for (const base of faces) {
    const a = pts[base],
      b = pts[base + 1],
      c = pts[base + 2];
    const normal = cross(sub(b, a), sub(c, a));
    const nLen = Math.sqrt(normal[0] * normal[0] + normal[1] * normal[1] + normal[2] * normal[2]);
    let shade = AMBIENT;
    if (nLen > 1e-9) {
      const n: Vec3 = [normal[0] / nLen, normal[1] / nLen, normal[2] / nLen];
      const d = Math.max(n[0] * LIGHT[0] + n[1] * LIGHT[1] + n[2] * LIGHT[2], 0);
      shade = AMBIENT + DIFFUSE * d;
    }
    const grey = Math.round(Math.min(BASE_GREY * shade + 30, 246));
    const fill = `rgb(${grey},${grey},${grey})`;

    const sa = toScreen(a),
      sb = toScreen(b),
      sc = toScreen(c);
    ctx.beginPath();
    ctx.moveTo(sa[0], sa[1]);
    ctx.lineTo(sb[0], sb[1]);
    ctx.lineTo(sc[0], sc[1]);
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
    // Same-colour hairline stroke masks anti-aliased seams between faces.
    ctx.strokeStyle = fill;
    ctx.lineWidth = 1;
    ctx.stroke();
  }
}

export function renderDataURL(triangles: Triangle[], upAxis: UpAxis, sizePx: number): string {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(sizePx * dpr);
  canvas.height = Math.round(sizePx * dpr);
  renderToCanvas(canvas, triangles, upAxis);
  return canvas.toDataURL("image/png");
}
