// Run: node --experimental-transform-types --no-warnings scripts/test-threemf.mts  (synthetic Bambu-style, Prusa-style and broken 3MF files)
import { zipSync, strToU8 } from "fflate";
import { read3MF, colour } from "../src/data/nexcal/threemf.ts";
import assert from "node:assert/strict";

const cube = (s: number) => {
  const V = [[0,0,0],[s,0,0],[s,s,0],[0,s,0],[0,0,s],[s,0,s],[s,s,s],[0,s,s]];
  const T = [[0,2,1],[0,3,2],[4,5,6],[4,6,7],[0,1,5],[0,5,4],[1,2,6],[1,6,5],[2,3,7],[2,7,6],[3,0,4],[3,4,7]];
  return `<mesh><vertices>${V.map(([x,y,z]) => `<vertex x="${x}" y="${y}" z="${z}"/>`).join("")}</vertices><triangles>${T.map(([a,b,c]) => `<triangle v1="${a}" v2="${b}" v3="${c}" paint_color="4"/>`).join("")}</triangles></mesh>`;
};
const hdr = (unit = "millimeter", extra = "") => `<?xml version="1.0" encoding="UTF-8"?><model unit="${unit}" xml:lang="en-US" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02" xmlns:p="http://schemas.microsoft.com/3dmanufacturing/production/2015/06">${extra}`;

/* ---- A: Bambu-style project, 2 plates, plate 1 sliced ---- */
const A = zipSync({
  "[Content_Types].xml": strToU8("<Types/>"),
  "3D/3dmodel.model": strToU8(hdr("millimeter", `<metadata name="Application">BambuStudio-02.00.00.00</metadata><metadata name="BambuStudio:3mfVersion">1</metadata>`) + `<resources>
   <object id="2" type="model"><components><component p:path="/3D/Objects/object_1.model" objectid="1" transform="1 0 0 0 1 0 0 0 1 0 0 0"/><component p:path="/3D/Objects/object_1.model" objectid="2" transform="1 0 0 0 1 0 0 0 1 5 5 5"/></components></object>
   <object id="4" type="model"><components><component p:path="/3D/Objects/object_2.model" objectid="1"/></components></object>
  </resources><build>
   <item objectid="2" transform="2 0 0 0 2 0 0 0 2 100 100 0" printable="1"/>
   <item objectid="2" transform="1 0 0 0 1 0 0 0 1 50 50 0" printable="1"/>
   <item objectid="4" transform="1 0 0 0 1 0 0 0 1 0 0 0" printable="1"/></build></model>`),
  "3D/Objects/object_1.model": strToU8(hdr() + `<resources><object id="1" type="model">${cube(20)}</object><object id="2" type="model">${cube(10)}</object></resources></model>`),
  "3D/Objects/object_2.model": strToU8(hdr() + `<resources><object id="1" type="model">${cube(30)}</object></resources></model>`),
  "Metadata/model_settings.config": strToU8(`<?xml version="1.0"?><config>
   <object id="2"><metadata key="name" value="Cube A"/><metadata key="extruder" value="1"/><part id="1" subtype="normal_part"><metadata key="extruder" value="2"/></part><part id="2" subtype="modifier_part"/></object>
   <object id="4"><metadata key="name" value="Cube B"/></object>
   <plate><metadata key="plater_id" value="1"/><metadata key="plater_name" value="Bases"/><model_instance><metadata key="object_id" value="2"/><metadata key="instance_id" value="0"/></model_instance><model_instance><metadata key="object_id" value="2"/><metadata key="instance_id" value="1"/></model_instance></plate>
   <plate><metadata key="plater_id" value="2"/><metadata key="plater_name" value=""/><model_instance><metadata key="object_id" value="4"/><metadata key="instance_id" value="0"/></model_instance></plate></config>`),
  "Metadata/slice_info.config": strToU8(`<?xml version="1.0"?><config><header><header_item key="X-BBL-Client-Type" value="slicer"/></header>
   <plate><metadata key="index" value="1"/><metadata key="prediction" value="5040"/><metadata key="weight" value="23.6"/><object identify_id="1" name="Cube A" skipped="false"/>
   <filament id="1" tray_info_idx="GFA00" type="PLA" color="#00AE42" used_m="6.4" used_g="20.1"/><filament id="2" type="PLA" color="#FFFFFF" used_m="1.1" used_g="3.5"/></plate></config>`),
  "Metadata/project_settings.config": strToU8(JSON.stringify({ printer_settings_id: "Bambu Lab P1S 0.4 nozzle", nozzle_diameter: ["0.4"], layer_height: "0.2", wall_loops: "3", sparse_infill_density: "15%", enable_support: "0", curr_bed_type: "Textured PEI Plate", filament_colour: ["#00AE42", "#FFFFFF"], filament_type: ["PLA", "PLA"], filament_settings_id: ["Bambu PLA Basic", "Bambu PLA Basic"] })),
  "Metadata/plate_1.png": new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3]),
});
{
  const f = read3MF(A);
  assert.equal(f.app, "BambuStudio-02.00.00.00"); assert.equal(f.sliced, true); assert.equal(f.geometry, "read");
  assert.deepEqual(f.plates.map((p) => p.index), [1, 2]);
  const p1 = f.plates[0], p2 = f.plates[1];
  assert.equal(p1.name, "Bases"); assert.equal(p2.name, "Plate 2");
  assert.equal(p1.items.length, 2);
  assert.ok(Math.abs(p1.items[0].analysis.volumeMm3 - 64000) < 1e-6, "20 mm cube scaled x2 = 64000, got " + p1.items[0].analysis.volumeMm3);
  assert.ok(Math.abs(p1.items[1].analysis.volumeMm3 - 8000) < 1e-6, "modifier part must not count");
  assert.deepEqual(p1.items[0].byExtruder, { 2: 64000 });
  assert.equal(p1.items[0].analysis.dimensions.x, 40);
  assert.equal(p1.slice?.grams, 23.6); assert.equal(p1.slice?.seconds, 5040);
  assert.deepEqual(p1.filaments.map((x) => [x.colour, x.grams]), [["#00ae42", 20.1], ["#ffffff", 3.5]]);
  assert.ok(p1.thumb.startsWith("data:image/png;base64,"));
  assert.equal(p2.items.length, 1); assert.ok(Math.abs(p2.items[0].analysis.volumeMm3 - 27000) < 1e-6); assert.equal(p2.slice, undefined);
  assert.deepEqual(p2.objects, ["Cube B"]); assert.equal(p2.filaments[0].colour, "#00ae42");
  assert.equal(f.machine.printer, "Bambu Lab P1S 0.4 nozzle"); assert.equal(f.machine.nozzle, 0.4); assert.equal(f.machine.layerHeight, 0.2); assert.equal(f.machine.walls, 3); assert.equal(f.machine.infill, 15);
  console.log("ok A: 2 plates, transforms, modifier skipped, sliced figures, colours, machine");
}
/* ---- B: single-file project in inches, no plates ---- */
{
  const B = zipSync({ "3D/3dmodel.model": strToU8(hdr("inch") + `<resources><object id="1" type="model">${cube(1)}</object></resources><build><item objectid="1"/></build></model>`) });
  const f = read3MF(B); assert.equal(f.plates.length, 1); assert.equal(f.sliced, false);
  assert.ok(Math.abs(f.plates[0].items[0].analysis.volumeMm3 - 25.4 ** 3) < 1e-6); assert.ok(Math.abs(f.plates[0].size!.x - 25.4) < 1e-9);
  assert.ok(f.notes.some((n) => /not sliced/.test(n)));
  console.log("ok B: inch unit, single plate, unsliced note");
}
/* ---- C: not a 3MF, hostile bits ---- */
{
  const C = zipSync({ "readme.txt": strToU8("hi") }); const f = read3MF(C); assert.equal(f.plates.length, 0); assert.ok(f.notes.some((n) => /not a standard 3MF/.test(n)));
  assert.equal(colour("red;background:url(x)"), null); assert.equal(colour("#00AE42FF"), "#00ae42"); assert.equal(colour("00ae42"), "#00ae42");
  const D = zipSync({ "3D/3dmodel.model": strToU8(hdr() + `<resources><object id="1" type="model"><mesh><vertices><vertex x="0" y="0" z="0"/></vertices><triangles><triangle v1="0" v2="5" v3="9"/></triangles></mesh></object></resources><build><item objectid="1"/></build></model>`) });
  const d = read3MF(D); assert.equal(d.plates[0].items[0].analysis.volumeMm3, 0);
  console.log("ok C: not-a-3mf note, colour validation, broken indices ignored");
}
/* ---- speed: 1M triangles ---- */
{
  const n = 1_000_000; const verts: string[] = [], tris: string[] = [];
  for (let i = 0; i < n + 2; i++) verts.push(`<vertex x="${(i % 100) / 3}" y="${Math.floor(i / 100) % 100 / 3}" z="${(i % 7)}"/>`);
  for (let i = 0; i < n; i++) tris.push(`<triangle v1="${i}" v2="${i + 1}" v3="${i + 2}"/>`);
  const xml = hdr() + `<resources><object id="1" type="model"><mesh><vertices>${verts.join("")}</vertices><triangles>${tris.join("")}</triangles></mesh></object></resources><build><item objectid="1"/></build></model>`;
  const z = zipSync({ "3D/3dmodel.model": strToU8(xml) }); const t0 = performance.now(); const f = read3MF(z);
  console.log(`ok speed: ${(xml.length / 1e6).toFixed(0)} MB of XML, ${f.plates[0].items[0].analysis.triangleCount} triangles read in ${Math.round(performance.now() - t0)} ms`);
}
