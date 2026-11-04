"""Genera los elementos 3D de la portada 'Currents' y los exporta a public/models/currents.glb.

La superficie de rayas se dibuja con un shader en Three.js; aquí se modelan las piezas con volumen:
- Ball: la bola cromada, apoyada sobre la superficie.
- TrailIn: la estela roja que llega desde la esquina superior izquierda hasta la bola.
La cola ondulada (rosa → amarillo) la dibuja el shader, porque sigue las ondas de las rayas.
Las coordenadas se toman de la portada original en "coordenadas de imagen" (0..1, y hacia abajo).
Ejecutar desde Blender: CURRENTS_PATH = ".../blender/currents.py"; exec(open(CURRENTS_PATH).read())
"""
import math
import os

import bmesh
import bpy
from mathutils import Vector

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__ if "__file__" in globals() else CURRENTS_PATH)))
OUT = os.path.join(ROOT, "public", "models", "currents.glb")

BALL_CENTER = (0.53, 0.62)  # imagen
BALL_RADIUS = 0.105  # imagen (la portada mide 1)
TUBE_SIDES = 10
SAMPLES_PER_SPAN = 24

# Tramo recto de la estela: de la esquina (0, 0) hacia el centro de la bola, hasta tocar su borde.
# (x, y, ancho) en coordenadas de imagen; coincide con el canal que abre el shader entre las rayas.
_reach = 1 - BALL_RADIUS / math.hypot(*BALL_CENTER)
TRAIL_IN = [
	(BALL_CENTER[0] * t, BALL_CENTER[1] * t, w)
	for t, w in ((0.0, 0.006), (0.3, 0.008), (0.6, 0.011), (0.8, 0.016), (_reach, 0.022))
]


def to_world(x, y):
	"""Imagen (0..1, y abajo) → Blender (portada de 2x2 centrada, y arriba)."""
	return Vector((x * 2 - 1, 1 - y * 2, 0))


def catmull_rom(points):
	"""Interpola (x, y, ancho) con Catmull-Rom para una curva suave."""
	pts = [points[0], *points, points[-1]]
	out = []
	for i in range(1, len(pts) - 2):
		p0, p1, p2, p3 = pts[i - 1], pts[i], pts[i + 1], pts[i + 2]
		for s in range(SAMPLES_PER_SPAN):
			t = s / SAMPLES_PER_SPAN
			out.append(
				tuple(
					0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t * t + (-a + 3 * b - 3 * c + d) * t ** 3)
					for a, b, c, d in zip(p0, p1, p2, p3)
				)
			)
	out.append(points[-1])
	return out


def add_ribbon_tube(name, points):
	"""Tubo de sección elíptica (ancho en el plano, fino en altura) que reposa sobre la superficie."""
	samples = catmull_rom(points)
	pts = [to_world(x, y) for x, y, _ in samples]
	widths = [w * 2 for _, _, w in samples]  # ancho de imagen → unidades
	lengths = [0.0]
	for a, b in zip(pts, pts[1:]):
		lengths.append(lengths[-1] + (b - a).length)
	total = lengths[-1]

	bm = bmesh.new()
	uv_layer = bm.loops.layers.uv.new("UVMap")
	rings = []
	for i, p in enumerate(pts):
		t = (pts[min(i + 1, len(pts) - 1)] - pts[max(i - 1, 0)]).normalized()
		n = Vector((-t.y, t.x, 0.0))
		half_w, half_h = widths[i] / 2, widths[i] * 0.22
		ring = []
		for k in range(TUBE_SIDES):
			a = 2 * math.pi * k / TUBE_SIDES
			off = n * math.cos(a) * half_w + Vector((0, 0, 1)) * (math.sin(a) * half_h + half_h)
			ring.append(bm.verts.new(p + off))
		rings.append(ring)
	for i in range(len(rings) - 1):
		for k in range(TUBE_SIDES):
			k2 = (k + 1) % TUBE_SIDES
			face = bm.faces.new((rings[i][k], rings[i + 1][k], rings[i + 1][k2], rings[i][k2]))
			for loop, ri in zip(face.loops, (i, i + 1, i + 1, i)):
				loop[uv_layer].uv = (lengths[ri] / total, 0.0)

	bmesh.ops.recalc_face_normals(bm, faces=bm.faces)  # normales hacia fuera
	mesh = bpy.data.meshes.new(name)
	bm.to_mesh(mesh)
	bm.free()
	mesh.shade_smooth()
	obj = bpy.data.objects.new(name, mesh)
	bpy.context.collection.objects.link(obj)
	return obj


def material(name, color, metallic, roughness):
	mat = bpy.data.materials.new(name)
	mat.use_nodes = True
	bsdf = next(n for n in mat.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
	bsdf.inputs["Base Color"].default_value = (*color, 1)
	bsdf.inputs["Metallic"].default_value = metallic
	bsdf.inputs["Roughness"].default_value = roughness
	return mat


def clear_scene():
	for ob in list(bpy.data.objects):
		bpy.data.objects.remove(ob, do_unlink=True)
	for coll in (bpy.data.meshes, bpy.data.materials, bpy.data.cameras, bpy.data.lights):
		for item in list(coll):
			if item.users == 0:
				coll.remove(item)


def build():
	clear_scene()
	trail_mat = material("Trail", (0.95, 0.12, 0.2), 0.0, 0.3)
	add_ribbon_tube("TrailIn", TRAIL_IN).data.materials.append(trail_mat)

	radius = BALL_RADIUS * 2
	center = to_world(*BALL_CENTER)
	bpy.ops.mesh.primitive_uv_sphere_add(segments=64, ring_count=32, radius=radius, location=(center.x, center.y, radius))
	ball = bpy.context.active_object
	ball.name = "Ball"
	ball.data.materials.append(material("Ball", (0.9, 0.9, 0.95), 1.0, 0.05))
	bpy.ops.object.shade_smooth()

	# superficie de referencia para previsualizar en Blender (no se exporta)
	bpy.ops.mesh.primitive_plane_add(size=2, location=(0, 0, 0))
	bpy.context.active_object.name = "PreviewSurface"
	bpy.context.active_object.data.materials.append(material("Surface", (0.55, 0.45, 0.7), 0.0, 0.8))


def export():
	os.makedirs(os.path.dirname(OUT), exist_ok=True)
	bpy.ops.object.select_all(action="DESELECT")
	for name in ("Ball", "TrailIn"):
		bpy.data.objects[name].select_set(True)
	bpy.ops.export_scene.gltf(
		filepath=OUT,
		export_format="GLB",
		use_selection=True,
		export_yup=True,
		export_draco_mesh_compression_enable=True,
	)
	print("exported", OUT, os.path.getsize(OUT), "bytes")


build()
export()
