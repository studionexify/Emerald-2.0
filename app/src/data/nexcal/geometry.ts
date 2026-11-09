/**
 * Nexcal — geometry parsing & mesh analysis.
 *
 * Ported line-for-line from the standalone Nexcal calculator
 * (`Nexcal - Price Calculator/assets/geometry.js`). STL / OBJ triangle-mesh
 * parsing plus volume / surface-area / bounding-box extraction. STEP/STP
 * goes through the same vendored `occt-import-js` WASM engine, lazy-loaded
 * from `/vendor/occt-import-js/` (copied from the source file unmodified).
 *
 * Browser-only (File/DataView/TextDecoder/dynamic <script> for STEP) — this
 * runs client-side inside the Nexcal page, same as the original.
 */

export type Vec3 = [number, number, number];
export type Triangle = [Vec3, Vec3, Vec3];

export type MeshUnit = "mm" | "cm" | "inch";
export type UpAxis = "X" | "-X" | "Y" | "-Y" | "Z" | "-Z";

const UNIT_SCALE: Record<MeshUnit, number> = { mm: 1, cm: 10, inch: 25.4 };

// ---------------------------------------------------------------------------
// STL
// ---------------------------------------------------------------------------

export function parseSTLArrayBuffer(buffer: ArrayBuffer): Triangle[] {
  const expectedBinaryLength = 84 + triangleCountFromBinaryHeader(buffer) * 50;
  if (buffer.byteLength === expectedBinaryLength) {
    return parseBinarySTL(buffer);
  }
  const text = new TextDecoder("utf-8").decode(buffer);
  if (/^\s*solid[\s\S]*facet\s+normal/i.test(text)) {
    return parseAsciiSTL(text);
  }
  // Fall back: binary STLs may legally start with "solid" bytes too.
  return parseBinarySTL(buffer);
}

function triangleCountFromBinaryHeader(buffer: ArrayBuffer): number {
  if (buffer.byteLength < 84) return -1;
  return new DataView(buffer).getUint32(80, true);
}

function parseBinarySTL(buffer: ArrayBuffer): Triangle[] {
  const view = new DataView(buffer);
  const triCount = view.getUint32(80, true);
  const triangles: Triangle[] = [];
  let offset = 84;
  for (let i = 0; i < triCount; i++) {
    offset += 12; // skip stored normal (recomputed, not trusted)
    const tri: Vec3[] = [];
    for (let v = 0; v < 3; v++) {
      tri.push([
        view.getFloat32(offset, true),
        view.getFloat32(offset + 4, true),
        view.getFloat32(offset + 8, true),
      ]);
      offset += 12;
    }
    offset += 2; // attribute byte count
    triangles.push(tri as Triangle);
  }
  return triangles;
}

function parseAsciiSTL(text: string): Triangle[] {
  const verts: Vec3[] = [];
  const re = /vertex\s+([-\d.eE+]+)\s+([-\d.eE+]+)\s+([-\d.eE+]+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    verts.push([parseFloat(m[1]), parseFloat(m[2]), parseFloat(m[3])]);
  }
  const triangles: Triangle[] = [];
  for (let i = 0; i + 2 < verts.length; i += 3) {
    triangles.push([verts[i], verts[i + 1], verts[i + 2]]);
  }
  return triangles;
}

// ---------------------------------------------------------------------------
// STEP / STP — vendored occt-import-js, lazy-loaded
// ---------------------------------------------------------------------------

const OCCT_BASE = import.meta.env.MODE === "artifact" ? "https://cdn.jsdelivr.net/npm/occt-import-js@0.0.23/dist/" : "./vendor/occt-import-js/";

interface OcctMesh {
  attributes: { position: { array: Float32Array | number[] } };
  index: { array: Uint32Array | number[] };
}
interface OcctResult {
  success: boolean;
  meshes: OcctMesh[];
}
interface OcctModule {
  ReadStepFile: (data: Uint8Array, params: null) => OcctResult;
}

declare global {
  interface Window {
    occtimportjs?: (opts: { locateFile: (file: string) => string }) => Promise<OcctModule>;
  }
}

let occtPromise: Promise<OcctModule> | null = null;

function loadOcct(): Promise<OcctModule> {
  if (occtPromise) return occtPromise;

  occtPromise = new Promise<OcctModule>((resolve, reject) => {
    const existing = document.querySelector(
      `script[src="${OCCT_BASE}occt-import-js.js"]`,
    );
    if (existing) existing.remove();

    const script = document.createElement("script");
    script.src = `${OCCT_BASE}occt-import-js.js`;
    script.onload = () => {
      if (typeof window.occtimportjs !== "function") {
        reject(new Error("STEP import engine failed to load"));
        return;
      }
      window
        .occtimportjs({ locateFile: (file) => OCCT_BASE + file })
        .then(resolve)
        .catch((err) => {
          console.error("occt-import-js init failed:", err);
          reject(new Error("Could not initialize STEP import engine"));
        });
    };
    script.onerror = () => reject(new Error("Could not load STEP import engine"));
    document.head.appendChild(script);
  }).catch((err) => {
    // Don't cache a failed load — the next STEP upload should retry rather
    // than being permanently stuck on a transient failure.
    occtPromise = null;
    throw err;
  });
  return occtPromise;
}

function meshesToTriangles(meshes: OcctMesh[]): Triangle[] {
  const triangles: Triangle[] = [];
  meshes.forEach((mesh) => {
    const pos = mesh.attributes.position.array;
    const idx = mesh.index.array;
    for (let i = 0; i + 2 < idx.length; i += 3) {
      const a = idx[i] * 3,
        b = idx[i + 1] * 3,
        c = idx[i + 2] * 3;
      triangles.push([
        [pos[a], pos[a + 1], pos[a + 2]],
        [pos[b], pos[b + 1], pos[b + 2]],
        [pos[c], pos[c + 1], pos[c + 2]],
      ]);
    }
  });
  return triangles;
}

export function parseSTEPArrayBuffer(buffer: ArrayBuffer): Promise<Triangle[]> {
  return loadOcct().then((occt) => {
    const result = occt.ReadStepFile(new Uint8Array(buffer), null);
    if (!result || !result.success || !result.meshes || result.meshes.length === 0) {
      throw new Error("Could not parse STEP file — no geometry found");
    }
    const triangles = meshesToTriangles(result.meshes);
    if (triangles.length === 0) throw new Error("STEP file contained no triangulated geometry");
    return triangles;
  });
}

// ---------------------------------------------------------------------------
// OBJ
// ---------------------------------------------------------------------------

function resolveVertexIndex(token: string, positions: Vec3[]): Vec3 {
  const posIndexStr = token.split("/")[0];
  let idx = parseInt(posIndexStr, 10);
  if (idx < 0) idx = positions.length + idx + 1; // relative index
  return positions[idx - 1];
}

export function parseOBJText(text: string): Triangle[] {
  const positions: Vec3[] = [];
  const triangles: Triangle[] = [];
  const lines = text.split(/\r\n|\n|\r/);

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line[0] === "#") continue;

    if (line.startsWith("v ") || line === "v") {
      const parts = line.split(/\s+/).slice(1).map(Number);
      positions.push([parts[0] || 0, parts[1] || 0, parts[2] || 0]);
      continue;
    }

    if (line.startsWith("f ") || line === "f") {
      const tokens = line.split(/\s+/).slice(1);
      const faceVerts = tokens.map((tok) => resolveVertexIndex(tok, positions));
      // Fan-triangulate any face with > 3 vertices.
      for (let i = 1; i + 1 < faceVerts.length; i++) {
        triangles.push([faceVerts[0], faceVerts[i], faceVerts[i + 1]]);
      }
    }
    // mtllib / usemtl / g / o / s / vt / vn are ignored.
  }

  return triangles;
}

// ---------------------------------------------------------------------------
// Mesh analysis
// ---------------------------------------------------------------------------

function cross(a: Vec3, b: Vec3): Vec3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}
function dot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}
function sub(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}
function vecLength(v: Vec3): number {
  return Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]);
}
function scalePoint(p: Vec3, scale: number): Vec3 {
  return [p[0] * scale, p[1] * scale, p[2] * scale];
}

export interface BBox {
  minX: number;
  minY: number;
  minZ: number;
  maxX: number;
  maxY: number;
  maxZ: number;
}

export interface MeshAnalysis {
  triangleCount: number;
  volumeMm3: number;
  surfaceAreaMm2: number;
  bbox: BBox;
  /** span along the chosen up-axis */
  height: number;
  dimensions: { x: number; y: number; z: number };
  warning: string | null;
}

export function analyzeMesh(
  triangles: Triangle[],
  options: { unit?: MeshUnit; upAxis?: UpAxis } = {},
): MeshAnalysis {
  const unitScale = options.unit ? UNIT_SCALE[options.unit] : 1;
  const upAxis = options.upAxis || "Z";

  if (!triangles || triangles.length === 0) {
    throw new Error("No triangles found in file");
  }

  let signedVolumeSum = 0;
  let surfaceAreaMm2 = 0;
  const bbox: BBox = {
    minX: Infinity,
    minY: Infinity,
    minZ: Infinity,
    maxX: -Infinity,
    maxY: -Infinity,
    maxZ: -Infinity,
  };

  for (const tri of triangles) {
    const p0 = scalePoint(tri[0], unitScale);
    const p1 = scalePoint(tri[1], unitScale);
    const p2 = scalePoint(tri[2], unitScale);

    signedVolumeSum += dot(p0, cross(p1, p2)) / 6;

    const edge1 = sub(p1, p0);
    const edge2 = sub(p2, p0);
    surfaceAreaMm2 += 0.5 * vecLength(cross(edge1, edge2));

    for (const p of [p0, p1, p2]) {
      if (p[0] < bbox.minX) bbox.minX = p[0];
      if (p[1] < bbox.minY) bbox.minY = p[1];
      if (p[2] < bbox.minZ) bbox.minZ = p[2];
      if (p[0] > bbox.maxX) bbox.maxX = p[0];
      if (p[1] > bbox.maxY) bbox.maxY = p[1];
      if (p[2] > bbox.maxZ) bbox.maxZ = p[2];
    }
  }

  const volumeMm3 = Math.abs(signedVolumeSum);

  const axisIndex = { X: 0, Y: 1, Z: 2, "-X": 0, "-Y": 1, "-Z": 2 }[upAxis];
  const mins = [bbox.minX, bbox.minY, bbox.minZ];
  const maxs = [bbox.maxX, bbox.maxY, bbox.maxZ];
  const height = maxs[axisIndex] - mins[axisIndex];

  const bboxVolume =
    (bbox.maxX - bbox.minX) * (bbox.maxY - bbox.minY) * (bbox.maxZ - bbox.minZ);
  let warning: string | null = null;
  if (bboxVolume > 0 && volumeMm3 / bboxVolume < 0.01) {
    warning = "Mesh may not be watertight/manifold — results may be inaccurate.";
  }

  return {
    triangleCount: triangles.length,
    volumeMm3,
    surfaceAreaMm2,
    bbox,
    height,
    dimensions: {
      x: bbox.maxX - bbox.minX,
      y: bbox.maxY - bbox.minY,
      z: bbox.maxZ - bbox.minZ,
    },
    warning,
  };
}

/**
 * Derives a uniformly-rescaled analysis from a base (unscaled) analysis —
 * volume scales cubically, area quadratically, linear dims linearly. Avoids
 * re-walking every triangle each time a part's target size changes.
 */
export function scaleMeshAnalysis(base: MeshAnalysis, factor: number): MeshAnalysis {
  const f2 = factor * factor;
  const f3 = f2 * factor;
  return {
    triangleCount: base.triangleCount,
    volumeMm3: base.volumeMm3 * f3,
    surfaceAreaMm2: base.surfaceAreaMm2 * f2,
    bbox: {
      minX: base.bbox.minX * factor,
      minY: base.bbox.minY * factor,
      minZ: base.bbox.minZ * factor,
      maxX: base.bbox.maxX * factor,
      maxY: base.bbox.maxY * factor,
      maxZ: base.bbox.maxZ * factor,
    },
    height: base.height * factor,
    dimensions: {
      x: base.dimensions.x * factor,
      y: base.dimensions.y * factor,
      z: base.dimensions.z * factor,
    },
    warning: base.warning,
  };
}

// ---------------------------------------------------------------------------
// Format dispatch
// ---------------------------------------------------------------------------

export function detectFormatAndParse(file: File): Promise<Triangle[]> {
  const name = file.name.toLowerCase();

  if (name.endsWith(".step") || name.endsWith(".stp")) {
    return file.arrayBuffer().then((buf) => parseSTEPArrayBuffer(buf));
  }
  if (name.endsWith(".stl")) {
    return file.arrayBuffer().then((buf) => parseSTLArrayBuffer(buf));
  }
  if (name.endsWith(".obj")) {
    return file.text().then((text) => parseOBJText(text));
  }
  return Promise.reject(new Error("Unsupported file type — please upload an STL, OBJ or STEP file."));
}
