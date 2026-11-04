"""Genera en 3D la portada 'Currents' y la exporta a public/models/currents.glb.

Todo lo que tiene forma se modela aquí; Three.js solo pone color, luz e interacción.
- Stripes: ~100 rayas lila como tubos planos. Siguen las líneas de corriente de un flujo potencial
  alrededor de la bola, psi = d_perp * (1 - R^2 / r^2): rectas hasta la bola y, detrás de ella,
  deformadas en el plano y en altura por ondas (relieve real, como un líquido).
- Trail: la estela que ocupa el hueco central entre rayas (psi = 0): recta hasta la bola y
  ondulada después, con las mismas ondas que las rayas.
- Ball: la bola cromada apoyada sobre la superficie.
Coordenadas de cálculo "de imagen" (0..1, y hacia abajo), medidas sobre la portada original.
UV de rayas = posición en la imagen; UV.x de la estela = distancia a la bola a lo largo de la trayectoria.
Ejecutar desde Blender: CURRENTS_PATH = ".../blender/currents.py"; exec(open(CURRENTS_PATH).read())
"""
import math
import os

import bmesh
import bpy
from mathutils import Vector, noise

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__ if "__file__" in globals() else CURRENTS_PATH)))
OUT = os.path.join(ROOT, "public", "models", "currents.glb")

BALL = Vector((0.53, 0.62))  # imagen
BALL_R = 0.105  # imagen (la portada mide 1)
DIR = BALL.normalized()  # trayectoria: de la esquina (0, 0) al centro de la bola
PERP = Vector((-DIR.y, DIR.x))

PERIOD = 1 / 70  # separación entre rayas en unidades de psi
GAP = 0.008  # medio hueco central (psi) por donde pasa la estela
STRIPE_WIDTH = 0.0088  # ancho de cada raya lila (imagen)
STRIPE_HEIGHT = 0.0035  # grosor de cada raya (imagen)
WAVE_AMP = 0.03  # amplitud lateral de las ondas (imagen)
WAVE_LIFT = 0.022  # amplitud en altura de las ondas (imagen)
SIDES = 6
FLOW_R = BALL_R * 0.85  # radio del flujo: algo menor que la bola para que las rayas se peguen a ella
DENT = 0.05  # profundidad del hoyo que hace la bola en la superficie (imagen)
DENT_WIDTH = 0.11  # alcance del hoyo desde el centro de la bola (imagen)
SINK = 0.45  # altura del centro de la bola sobre el fondo del hoyo, en radios
# Se modela con un pequeño margen fuera de la portada: al girarla, el marco de la web recorta lo que sobra
DOMAIN_X = (-0.06, 1.06)
DOMAIN_Y = (-0.06, 1.06)


def along_across(p):
	rel = p - BALL
	return rel.dot(DIR), rel.dot(PERP)


def wake(p):
	"""0 antes de la bola; abanico que se abre detrás de ella."""
	a, c = along_across(p)
	spread = 0.06 + 1.1 * max(a, 0.0)
	fan = math.exp(-((c / spread) ** 2))
	t = min(max((a + 0.06) / 0.18, 0.0), 1.0)
	return t * t * (3 - 2 * t) * fan


def warp(p):
	"""Deformación de la estela: desplazamiento lateral y altura (todo en imagen)."""
	w = wake(p)
	if w < 1e-4:
		return p.copy(), 0.0
	a, _ = along_across(p)
	n = noise.noise(Vector((p.x * 5, p.y * 5, 0.3)))
	phase = a * 34 + n * 6
	q = p + PERP * (w * WAVE_AMP * math.sin(phase))
	q += Vector((noise.noise(Vector((q.x * 13, q.y * 13, 1.7))), noise.noise(Vector((q.x * 13, q.y * 13, 4.1))))) * (w * 0.022)
	lift = w * WAVE_LIFT * (0.5 + 0.5 * math.sin(phase + 1.2))
	return q, lift


def dent(p):
	"""Hoyo suave alrededor de la bola: la superficie cede bajo su peso (valor negativo)."""
	r = (p - BALL).length
	return -DENT * math.exp(-((r / DENT_WIDTH) ** 2))


def across_for(a, c):
	"""Resuelve psi(a, b) = c para b (mismo lado que c), por bisección."""
	sign = 1 if c >= 0 else -1
	c = abs(c)
	lo = math.sqrt(max(FLOW_R * FLOW_R - a * a, 0.0)) + 1e-6
	hi = c + BALL_R + 1.0
	for _ in range(40):
		mid = (lo + hi) / 2
		if mid * (1 - FLOW_R * FLOW_R / (a * a + mid * mid)) < c:
			lo = mid
		else:
			hi = mid
	return sign * (lo + hi) / 2


def along_samples():
	"""Pocas muestras en el tramo recto, muchas cerca de la bola y en la estela."""
	upstream = [-2.0 + (1.85 * i / 34) for i in range(34)]
	downstream = [-0.15 + (1.45 * i / 320) for i in range(321)]
	return upstream + downstream


def inside(p):
	return DOMAIN_X[0] <= p.x <= DOMAIN_X[1] and DOMAIN_Y[0] <= p.y <= DOMAIN_Y[1]


def to_world(p, lift=0.0):
	return Vector((p.x * 2 - 1, 1 - p.y * 2, lift * 2))


def edge_point(a, b):
	"""Punto donde el segmento a→b (uno dentro, otro fuera) cruza el borde de la portada."""
	lo, hi = (0.0, 1.0) if inside(a[0]) else (1.0, 0.0)
	for _ in range(24):
		mid = (lo + hi) / 2
		if inside(a[0].lerp(b[0], mid)):
			lo = mid
		else:
			hi = mid
	t = lo
	return (a[0].lerp(b[0], t), a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t)


def clip_runs(points):
	"""Divide una polilínea en tramos dentro de la portada, cortados justo en el borde."""
	runs, run = [], []
	for prev, item in zip([None, *points], points):
		if inside(item[0]):
			if not run and prev is not None:
				run.append(edge_point(prev, item))
			run.append(item)
		elif run:
			run.append(edge_point(prev, item))
			runs.append(run)
			run = []
	if run:
		runs.append(run)
	return [r for r in runs if len(r) > 2]


def add_tube(bm, uv_layer, run, half_w, half_h, uv_of):
	"""Tubo de sección elíptica sobre la polilínea run = [(p_imagen, lift, extra), ...]."""
	pts = [to_world(p, lift) for p, lift, _ in run]
	rings = []
	for i, (p, _, extra) in enumerate(run):
		t = pts[min(i + 1, len(pts) - 1)] - pts[max(i - 1, 0)]
		t.z = 0
		t.normalize()
		n = Vector((-t.y, t.x, 0.0))
		hw = half_w(extra) * 2
		hh = half_h * 2
		ring = []
		for k in range(SIDES):
			ang = 2 * math.pi * k / SIDES
			off = n * math.cos(ang) * hw + Vector((0, 0, math.sin(ang) * hh + hh))
			ring.append(bm.verts.new(pts[i] + off))
		rings.append((ring, uv_of(p, extra)))
	for i in range(len(rings) - 1):
		(r0, uv0), (r1, uv1) = rings[i], rings[i + 1]
		for k in range(SIDES):
			k2 = (k + 1) % SIDES
			face = bm.faces.new((r0[k], r1[k], r1[k2], r0[k2]))
			for loop, uv in zip(face.loops, (uv0, uv1, uv1, uv0)):
				loop[uv_layer].uv = uv


def finish_mesh(name, bm, mat):
	bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
	mesh = bpy.data.meshes.new(name)
	bm.to_mesh(mesh)
	bm.free()
	mesh.shade_smooth()
	mesh.materials.append(mat)
	obj = bpy.data.objects.new(name, mesh)
	bpy.context.collection.objects.link(obj)
	return obj


def build_stripes(mat):
	bm = bmesh.new()
	uv_layer = bm.loops.layers.uv.new("UVMap")
	samples = along_samples()
	count = 0
	for side in (-1, 1):
		k = 0
		while True:
			c = side * (GAP + PERIOD * (k + 0.5))
			k += 1
			if abs(c) > 0.9:
				break
			line = []
			for a in samples:
				b = across_for(a, c)
				p = BALL + DIR * a + PERP * b
				q, lift = warp(p)
				line.append((q, lift + dent(p), 0.0))
			for run in clip_runs(line):
				add_tube(bm, uv_layer, run, lambda _: STRIPE_WIDTH / 2, STRIPE_HEIGHT / 2, lambda p, _: (p.x, p.y))
				count += 1
	print("stripes:", count)
	return finish_mesh("Stripes", bm, mat)


def trail_width(a):
	"""Medio ancho de la estela (imagen): se ensancha al acercarse a la bola."""
	if a < 0:
		return 0.005 + 0.012 * max(0.0, 1 + a / 0.35) ** 2
	return 0.01


def build_trail(mat):
	"""Estela por el hueco central: recta hasta el borde de la bola, ondulada después."""
	bm = bmesh.new()
	uv_layer = bm.loops.layers.uv.new("UVMap")
	start = BALL.length + 0.1  # empieza justo fuera de la portada, arriba a la izquierda
	upstream = [-start + (start - FLOW_R) * i / 50 for i in range(51)]
	downstream = [FLOW_R + 1.3 * i / 300 for i in range(301)]
	for part in (upstream, downstream):
		line = []
		for a in part:
			p = BALL + DIR * a
			q, lift = warp(p)
			line.append((q, lift + dent(p) + 0.001, a))
		for run in clip_runs(line):
			add_tube(bm, uv_layer, run, trail_width, 0.0018, lambda _, a: (a, 0.0))
	return finish_mesh("Trail", bm, mat)


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
	build_stripes(material("Stripes", (0.75, 0.62, 0.9), 0.0, 0.5))
	build_trail(material("Trail", (0.95, 0.12, 0.2), 0.0, 0.3))

	radius = BALL_R * 2
	center = to_world(BALL)
	bottom = dent(BALL) * 2  # fondo del hoyo (mundo)
	bpy.ops.mesh.primitive_uv_sphere_add(
		segments=64, ring_count=32, radius=radius, location=(center.x, center.y, bottom + radius * SINK)
	)
	ball = bpy.context.active_object
	ball.name = "Ball"
	ball.data.materials.append(material("Chrome", (0.95, 0.95, 0.97), 1.0, 0.02))
	bpy.ops.object.shade_smooth()

	# fondo negro solo para previsualizar en Blender (en Three.js lo pone la escena)
	bpy.ops.mesh.primitive_plane_add(size=4, location=(0, 0, -DENT * 2 - 0.01))
	bpy.context.active_object.name = "PreviewBase"
	bpy.context.active_object.data.materials.append(material("Ink", (0.02, 0.01, 0.03), 0.0, 0.9))


def export():
	os.makedirs(os.path.dirname(OUT), exist_ok=True)
	bpy.ops.object.select_all(action="DESELECT")
	for name in ("Ball", "Stripes", "Trail"):
		bpy.data.objects[name].select_set(True)
	bpy.ops.export_scene.gltf(
		filepath=OUT,
		export_format="GLB",
		use_selection=True,
		export_yup=True,
		export_normals=True,
		export_draco_mesh_compression_enable=True,
	)
	print("exported", OUT, os.path.getsize(OUT), "bytes")


build()
export()
