"""Genera el modelo de la portada 'Currents' y lo exporta a public/models/currents.glb.

Las líneas son líneas de corriente de un flujo potencial alrededor de un cilindro:
	psi = y * (1 - R^2 / r^2)
Se agrupan en capas (Layer_0..N) a distintas profundidades para el parallax en Three.js.
Ejecutar desde Blender: exec(open(".../blender/currents.py").read())
"""
import math
import os

import bmesh
import bpy
from mathutils import Vector

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__ if "__file__" in globals() else CURRENTS_PATH)))
OUT = os.path.join(ROOT, "public", "models", "currents.glb")

HALF = 1.0  # la portada mide 2x2 unidades, centrada en el origen
R = 0.32  # radio del obstáculo (la bola)
BALL = Vector((0.18, -0.12))  # centro de la bola en la portada
ANGLE = math.radians(-28)  # el flujo cruza la portada en diagonal
LINES = 46
LAYERS = 4
LAYER_GAP = 0.06
TUBE_RADIUS = 0.0065
TUBE_SIDES = 6
SAMPLES = 260


def stream_y(x, c):
	"""Devuelve y >= 0 tal que psi(x, y) = c (c > 0), por bisección."""
	lo = math.sqrt(max(R * R - x * x, 0.0)) + 1e-6
	hi = c + R + 1.0
	for _ in range(48):
		mid = (lo + hi) / 2
		r2 = x * x + mid * mid
		if mid * (1 - R * R / r2) < c:
			lo = mid
		else:
			hi = mid
	return (lo + hi) / 2


def to_cover(x, y):
	ca, sa = math.cos(ANGLE), math.sin(ANGLE)
	return Vector((BALL.x + x * ca - y * sa, BALL.y + x * sa + y * ca))


def streamline(c, wobble):
	"""Polilíneas (recortadas al cuadrado de la portada) para la línea psi = c."""
	sign = 1 if c >= 0 else -1
	c = max(abs(c), 1e-3)
	segments, current = [], []
	span = 3.2
	for i in range(SAMPLES):
		x = -span + 2 * span * i / (SAMPLES - 1)
		y = sign * stream_y(x, c)
		y += wobble * math.sin(x * 2.3 + c * 9.0) * 0.02  # leve ondulación orgánica
		p = to_cover(x, y)
		if abs(p.x) <= HALF and abs(p.y) <= HALF:
			current.append(p)
		elif current:
			segments.append(current)
			current = []
	if current:
		segments.append(current)
	return [s for s in segments if len(s) > 3]


def add_tube(bm, uv_layer, pts, z, uv_v_offset):
	"""Tubo a lo largo de pts; UV.x = recorrido normalizado, UV.y = id de la línea."""
	lengths = [0.0]
	for a, b in zip(pts, pts[1:]):
		lengths.append(lengths[-1] + (b - a).length)
	total = lengths[-1] or 1.0
	rings = []
	for i, p in enumerate(pts):
		t = (pts[min(i + 1, len(pts) - 1)] - pts[max(i - 1, 0)]).normalized()
		n = Vector((-t.y, t.x, 0.0))
		ring = []
		for k in range(TUBE_SIDES):
			a = 2 * math.pi * k / TUBE_SIDES
			off = n * math.cos(a) * TUBE_RADIUS + Vector((0, 0, 1)) * math.sin(a) * TUBE_RADIUS
			ring.append(bm.verts.new((p.x + off.x, p.y + off.y, z + off.z)))
		rings.append(ring)
	for i in range(len(rings) - 1):
		for k in range(TUBE_SIDES):
			k2 = (k + 1) % TUBE_SIDES
			f = bm.faces.new((rings[i][k], rings[i + 1][k], rings[i + 1][k2], rings[i][k2]))
			for loop, (ri, kk) in zip(f.loops, ((i, k), (i + 1, k), (i + 1, k2), (i, k2))):
				loop[uv_layer].uv = (lengths[ri] / total, uv_v_offset)


def clear_scene():
	for ob in list(bpy.data.objects):
		bpy.data.objects.remove(ob, do_unlink=True)
	for coll in (bpy.data.meshes, bpy.data.materials):
		for item in list(coll):
			if item.users == 0:
				coll.remove(item)


def material(name, color, metallic, roughness):
	mat = bpy.data.materials.new(name)
	mat.use_nodes = True
	bsdf = next(n for n in mat.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
	bsdf.inputs["Base Color"].default_value = (*color, 1)
	bsdf.inputs["Metallic"].default_value = metallic
	bsdf.inputs["Roughness"].default_value = roughness
	return mat


def build():
	clear_scene()
	line_mat = material("Lines", (0.95, 0.45, 0.2), 0.0, 0.35)
	ball_mat = material("Ball", (0.9, 0.9, 0.95), 1.0, 0.12)

	layers = [bmesh.new() for _ in range(LAYERS)]
	uvs = [bm.loops.layers.uv.new("UVMap") for bm in layers]
	for i in range(LINES):
		# reparte psi de -1.6 a 1.6, más denso cerca de la bola
		s = -1 + 2 * i / (LINES - 1)
		c = math.copysign(abs(s) ** 1.35 * 1.6, s)
		layer = i % LAYERS
		z = 0.02 + layer * LAYER_GAP
		for seg in streamline(c, wobble=1.0):
			add_tube(layers[layer], uvs[layer], seg, z, i / (LINES - 1))

	for idx, bm in enumerate(layers):
		mesh = bpy.data.meshes.new(f"Layer_{idx}")
		bm.to_mesh(mesh)
		bm.free()
		mesh.shade_smooth()
		mesh.materials.append(line_mat)
		bpy.context.collection.objects.link(bpy.data.objects.new(f"Layer_{idx}", mesh))

	bpy.ops.mesh.primitive_uv_sphere_add(segments=48, ring_count=24, radius=R * 0.82, location=(BALL.x, BALL.y, 0.32))
	ball = bpy.context.active_object
	ball.name = "Ball"
	ball.data.materials.append(ball_mat)
	bpy.ops.object.shade_smooth()

	bpy.ops.object.camera_add(location=(0, 0, 4.2))
	bpy.context.scene.camera = bpy.context.active_object
	bpy.ops.object.light_add(type="AREA", location=(1.5, -1.5, 3))
	bpy.context.active_object.data.energy = 300


def export():
	os.makedirs(os.path.dirname(OUT), exist_ok=True)
	bpy.ops.object.select_all(action="DESELECT")
	for ob in bpy.data.objects:
		if ob.type == "MESH":
			ob.select_set(True)
	bpy.ops.export_scene.gltf(filepath=OUT, export_format="GLB", use_selection=True, export_yup=True)
	print("exported", OUT, os.path.getsize(OUT), "bytes")


build()
export()
