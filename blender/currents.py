"""Genera en Blender la portada 'Currents' completa y la exporta a public/models/currents.glb.

Referencia: la portada original de Robert Beatty. Toda la portada se hace aquí (forma, color,
materiales y texto); la web solo la carga y añade la interacción.
- Stripes: ~100 rayas lila (tubos planos) que siguen las líneas de corriente de un flujo potencial
  alrededor de la bola, psi = d_perp * (1 - R^2 / r^2): rectas hasta la bola y onduladas detrás,
  en el plano y en altura. El color (lila que se oscurece arriba a la derecha) va en sus vértices.
- Trail: una sola línea por el hueco central (psi = 0), a ras de las rayas: hilo rojo fino y recto,
  mancha rosa al llegar a la bola, pasa por debajo y sale como cola ondulada naranja y amarilla.
- Ball: bola de cromo gris satinado hundida en un hoyo de la superficie.
- Title: "TAME IMPALA" y "CURRENTS" en naranja.
- public/models/ball_env.jpg: panorámica renderizada desde el centro de la bola (rayas, cielo de
  estudio y una ventana de luz arriba a la izquierda) que la web usa como reflejo del cromo.
Coordenadas de cálculo "de imagen" (0..1, y hacia abajo), medidas sobre la portada original.
Ejecutar desde Blender: CURRENTS_PATH = ".../blender/currents.py"; exec(open(CURRENTS_PATH).read())
"""
import math
import os

import bmesh
import bpy
from mathutils import Matrix, Vector, noise

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__ if "__file__" in globals() else CURRENTS_PATH)))
OUT = os.path.join(ROOT, "public", "models", "currents.glb")
ENV_OUT = os.path.join(ROOT, "public", "models", "ball_env.jpg")
FONT = "/usr/share/fonts/liberation/LiberationSans-Bold.ttf"

BALL = Vector((0.53, 0.62))  # imagen
BALL_R = 0.105  # imagen (la portada mide 1)
DIR = BALL.normalized()  # trayectoria: de la esquina (0, 0) al centro de la bola
PERP = Vector((-DIR.y, DIR.x))

PERIOD = 1 / 70  # separación entre rayas en unidades de psi
GAP = 0.008  # medio hueco central (psi) por donde pasa la estela
STRIPE_WIDTH = 0.0088  # ancho de cada raya lila (imagen)
STRIPE_HEIGHT = 0.0035  # grosor de cada raya (imagen)
WAVE_AMP = 0.03  # amplitud lateral de las ondas (imagen)
WAVE_LIFT = 0.055  # amplitud en altura de las ondas (imagen): relieve visible al girar
SIDES = 6
FLOW_R = BALL_R * 0.85  # radio del flujo: algo menor que la bola para que las rayas se peguen a ella
DENT = 0.075  # profundidad del hoyo que hace la bola en la superficie (imagen)
DENT_WIDTH = 0.11  # alcance del hoyo desde el centro de la bola (imagen)
SINK = 0.45  # altura del centro de la bola sobre el fondo del hoyo, en radios
TITLE_LIFT = 0.07  # el texto flota por delante de la superficie (imagen): capa propia para el parallax
TRAIL_THIN = 0.0032  # medio ancho del hilo rojo (imagen)
SMEAR = 0.2  # distancia antes de la bola en la que el hilo se abre en una mancha rosa (imagen)
SMEAR_WIDTH = 0.026  # medio ancho de la mancha junto a la bola (imagen)
TAIL_WIDTH = 0.012  # medio ancho de la cola ondulada (imagen)
# Se modela con un pequeño margen fuera de la portada: al girarla, el marco de la web recorta lo que sobra
DOMAIN_X = (-0.06, 1.06)
DOMAIN_Y = (-0.06, 1.06)

# Colores tomados de la portada original (sRGB)
LILAC_NEAR = (0.8, 0.68, 0.95)
LILAC_FAR = (0.2, 0.09, 0.3)
RED = (0.95, 0.08, 0.18)
PINK = (1.0, 0.3, 0.55)
ORANGE = (1.0, 0.55, 0.1)
YELLOW = (1.0, 0.82, 0.25)
TITLE_ORANGE = (0.95, 0.6, 0.18)


def smoothstep(e0, e1, x):
	t = min(max((x - e0) / (e1 - e0), 0.0), 1.0)
	return t * t * (3 - 2 * t)


def mix(a, b, t):
	return tuple(x + (y - x) * t for x, y in zip(a, b))


def to_linear(c):
	"""sRGB → lineal (los colores de vértice y de material de Blender son lineales)."""
	return tuple(x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c)


def stripe_color(uv):
	"""Lila que se oscurece hacia arriba a la derecha, como la superficie que se aleja del original."""
	x, y = uv
	far = smoothstep(0.35, 1.15, x * 0.75 + (1 - y) * 0.7)
	return mix(LILAC_NEAR, LILAC_FAR, far)


def trail_color(uv):
	"""Rojo hasta la bola, rosa al rodearla, naranja y amarillo en la cola (uv.x = avance)."""
	a = uv[0]
	if a < 0:
		return mix(RED, PINK, smoothstep(-0.25, -0.05, a))
	return mix(mix(PINK, ORANGE, smoothstep(0.14, 0.26, a)), YELLOW, smoothstep(0.26, 0.5, a))


def along_across(p):
	rel = p - BALL
	return rel.dot(DIR), rel.dot(PERP)


def wake(p):
	"""0 antes de la bola; abanico que se abre detrás de ella."""
	a, c = along_across(p)
	spread = 0.06 + 1.1 * max(a, 0.0)
	fan = math.exp(-((c / spread) ** 2))
	return smoothstep(-0.06, 0.12, a) * fan


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
	upstream = [-1.3 + (1.15 * i / 24) for i in range(24)]
	downstream = [-0.15 + (1.05 * i / 260) for i in range(261)]
	return upstream + downstream


def inside(p):
	return DOMAIN_X[0] <= p.x <= DOMAIN_X[1] and DOMAIN_Y[0] <= p.y <= DOMAIN_Y[1]


def to_world(p, lift=0.0):
	return Vector((p.x * 2 - 1, 1 - p.y * 2, lift * 2))


def edge_point(a, b):
	"""Punto donde el segmento a→b (uno dentro, otro fuera) cruza el borde."""
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
	"""Divide una polilínea en tramos dentro del dominio, cortados justo en el borde."""
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


def paint(mesh, color_of):
	"""Color de vértice (por esquina) calculado a partir de la UV."""
	attr = mesh.color_attributes.new("Col", "FLOAT_COLOR", "CORNER")
	uvs = mesh.uv_layers.active.data
	for i, loop_uv in enumerate(uvs):
		attr.data[i].color = (*to_linear(color_of(loop_uv.uv)), 1.0)


def finish_mesh(name, bm, mat, color_of=None):
	bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
	mesh = bpy.data.meshes.new(name)
	bm.to_mesh(mesh)
	bm.free()
	mesh.shade_smooth()
	if color_of:
		paint(mesh, color_of)
	mesh.materials.append(mat)
	obj = bpy.data.objects.new(name, mesh)
	bpy.context.collection.objects.link(obj)
	return obj


def build_stripes(mat):
	bm = bmesh.new()
	uv_layer = bm.loops.layers.uv.new("UVMap")
	samples = along_samples()
	for side in (-1, 1):
		k = 0
		while True:
			c = side * (GAP + PERIOD * (k + 0.5))
			k += 1
			if abs(c) > 0.9:
				break
			line = []
			for a in samples:
				p = BALL + DIR * a + PERP * across_for(a, c)
				q, lift = warp(p)
				line.append((q, lift + dent(p), 0.0))
			for run in clip_runs(line):
				add_tube(bm, uv_layer, run, lambda _: STRIPE_WIDTH / 2, STRIPE_HEIGHT / 2, lambda p, _: (p.x, p.y))
	return finish_mesh("Stripes", bm, mat, stripe_color)


def trail_width(a):
	"""Medio ancho de la estela (imagen), medido sobre la portada original: hilo rojo muy fino,
	mancha rosa que se abre al llegar a la bola y cola ancha al salir por debajo."""
	if a < -SMEAR:
		return TRAIL_THIN
	if a < 0:
		return TRAIL_THIN + (SMEAR_WIDTH - TRAIL_THIN) * smoothstep(-SMEAR, -BALL_R * 0.6, a)
	return TAIL_WIDTH + (SMEAR_WIDTH - TAIL_WIDTH) * (1 - smoothstep(BALL_R, BALL_R + 0.08, a))


def build_trail(mat):
	"""Una sola línea por el hueco central (psi = 0), pintada a ras de las rayas: entra recta por la
	esquina, pasa por debajo de la bola y sale por abajo ondulada con las mismas ondas."""
	bm = bmesh.new()
	uv_layer = bm.loops.layers.uv.new("UVMap")
	start = BALL.length + 0.1  # empieza justo fuera de la portada, arriba a la izquierda
	steps = [-start + (start + 1.3) * i / 520 for i in range(521)]
	line = []
	for a in steps:
		p = BALL + DIR * a
		q, lift = warp(p)
		line.append((q, lift + dent(p) + 0.0006, a))  # a ras de las rayas, apenas por encima
	for run in clip_runs(line):
		add_tube(bm, uv_layer, run, trail_width, STRIPE_HEIGHT / 2, lambda _, a: (a, 0.0))
	return finish_mesh("Trail", bm, mat, trail_color)


def vertex_color_material(name, roughness):
	mat = bpy.data.materials.new(name)
	mat.use_nodes = True
	nodes = mat.node_tree.nodes
	bsdf = next(n for n in nodes if n.type == "BSDF_PRINCIPLED")
	col = nodes.new("ShaderNodeVertexColor")
	col.layer_name = "Col"
	mat.node_tree.links.new(col.outputs["Color"], bsdf.inputs["Base Color"])
	bsdf.inputs["Roughness"].default_value = roughness
	return mat


def material(name, color, metallic, roughness, emission=0.0):
	mat = bpy.data.materials.new(name)
	mat.use_nodes = True
	bsdf = next(n for n in mat.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
	bsdf.inputs["Base Color"].default_value = (*to_linear(color), 1)
	bsdf.inputs["Metallic"].default_value = metallic
	bsdf.inputs["Roughness"].default_value = roughness
	if emission:
		bsdf.inputs["Emission Color"].default_value = (*to_linear(color), 1)
		bsdf.inputs["Emission Strength"].default_value = emission
	return mat


def build_title():
	"""Texto naranja de la banda superior, como en la portada, convertido a malla."""
	mat = material("Title", TITLE_ORANGE, 0.0, 0.5, emission=1.0)
	font = bpy.data.fonts.load(FONT, check_existing=True) if os.path.exists(FONT) else None
	parts = []
	for body, x, align in (("TAME IMPALA", 0.035, "LEFT"), ("CURRENTS", 0.965, "RIGHT")):
		bpy.ops.object.text_add(location=to_world(Vector((x, 0.042)), TITLE_LIFT))
		obj = bpy.context.active_object
		obj.data.body = body
		obj.data.align_x = align
		obj.data.size = 0.062
		obj.data.extrude = 0.003
		if font:
			obj.data.font = font
		parts.append(obj)
	bpy.ops.object.select_all(action="DESELECT")
	for obj in parts:
		obj.select_set(True)
	bpy.context.view_layer.objects.active = parts[0]
	bpy.ops.object.convert(target="MESH")
	bpy.ops.object.join()
	title = bpy.context.active_object
	title.name = "Title"
	title.data.name = "Title"
	title.data.materials.clear()
	title.data.materials.append(mat)


def clear_scene():
	for ob in list(bpy.data.objects):
		bpy.data.objects.remove(ob, do_unlink=True)
	for coll in (bpy.data.meshes, bpy.data.materials, bpy.data.cameras, bpy.data.lights, bpy.data.curves):
		for item in list(coll):
			if item.users == 0:
				coll.remove(item)


def build():
	clear_scene()
	build_stripes(vertex_color_material("Stripes", 0.5))
	build_trail(vertex_color_material("Trail", 0.35))

	radius = BALL_R * 2
	center = to_world(BALL)
	bottom = dent(BALL) * 2  # fondo del hoyo (mundo)
	bpy.ops.mesh.primitive_uv_sphere_add(
		segments=64, ring_count=32, radius=radius, location=(center.x, center.y, bottom + radius * SINK)
	)
	ball = bpy.context.active_object
	ball.name = "Ball"
	# cromo gris satinado (no espejo): metálico con algo de rugosidad, el entorno se difumina
	ball.data.materials.append(material("Chrome", (0.66, 0.66, 0.7), 1.0, 0.3))
	bpy.ops.object.shade_smooth()

	build_title()


def render_ball_env():
	"""Panorámica desde el centro de la bola: lo que reflejará el cromo en la web.
	Orientación (convenio equirectangular de Three.js): arriba = +Y de la portada, centro = +X."""
	scene = bpy.context.scene
	ball = bpy.data.objects["Ball"]
	ball.hide_render = True
	studio = []

	# cielo de estudio como en el original, en vertical de la portada (eje Y): lila abajo (las rayas),
	# gris claro en el centro y oscuro arriba.
	world = bpy.data.worlds.new("StudioSky")
	world.use_nodes = True
	nodes, links = world.node_tree.nodes, world.node_tree.links
	bg = next(n for n in nodes if n.type == "BACKGROUND")
	geo = nodes.new("ShaderNodeTexCoord")
	sep = nodes.new("ShaderNodeSeparateXYZ")
	ramp = nodes.new("ShaderNodeValToRGB")
	ramp.color_ramp.elements[0].position = 0.1
	ramp.color_ramp.elements[0].color = (*to_linear((0.62, 0.5, 0.78)), 1)
	middle = ramp.color_ramp.elements.new(0.45)
	middle.color = (*to_linear((0.86, 0.85, 0.89)), 1)
	ramp.color_ramp.elements[2].position = 0.9
	ramp.color_ramp.elements[2].color = (*to_linear((0.26, 0.25, 0.29)), 1)
	remap = nodes.new("ShaderNodeMath")
	remap.operation = "MULTIPLY_ADD"  # Y (-1..1) → 0..1
	remap.inputs[1].default_value = 0.5
	remap.inputs[2].default_value = 0.5
	links.new(geo.outputs["Generated"], sep.inputs[0])
	links.new(sep.outputs["Y"], remap.inputs[0])
	links.new(remap.outputs["Value"], ramp.inputs["Fac"])
	links.new(ramp.outputs["Color"], bg.inputs["Color"])
	scene.world = world

	# ventana de luz arriba a la izquierda (el brillo principal de la bola en el original)
	bpy.ops.mesh.primitive_circle_add(vertices=48, radius=1.1, fill_type="NGON", location=(-1.6, 1.4, 2.6))
	softbox = bpy.context.active_object
	direction = Vector(ball.location) - softbox.location
	softbox.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()
	softbox.data.materials.append(material("Softbox", (1, 1, 1), 0.0, 1.0, emission=6.0))
	studio.append(softbox)

	bpy.ops.object.camera_add(location=ball.location)
	cam = bpy.context.active_object
	cam.data.type = "PANO"
	cam.data.panorama_type = "EQUIRECTANGULAR"
	# ejes locales de la cámara en el mundo: X → +Z, Y → +Y (arriba de la imagen), -Z → +X (centro)
	cam.rotation_euler = Matrix(((0, 0, -1), (0, 1, 0), (1, 0, 0))).to_euler()
	studio.append(cam)

	previous = (scene.render.engine, scene.camera, scene.render.resolution_x, scene.render.resolution_y)
	try:
		scene.render.engine = "CYCLES"
	except TypeError as error:  # el mensaje enumera los motores disponibles
		raise RuntimeError(f"Se necesita Cycles para la panorámica del reflejo: {error}") from error
	scene.cycles.samples = 48
	scene.render.resolution_x, scene.render.resolution_y = 1024, 512
	scene.render.resolution_percentage = 100
	scene.render.image_settings.file_format = "JPEG"
	scene.render.image_settings.quality = 90
	scene.camera = cam
	scene.render.filepath = ENV_OUT
	bpy.ops.render.render(write_still=True)
	print("ball env", ENV_OUT, os.path.getsize(ENV_OUT), "bytes")

	scene.render.engine, scene.camera, scene.render.resolution_x, scene.render.resolution_y = previous
	for obj in studio:
		bpy.data.objects.remove(obj, do_unlink=True)
	ball.hide_render = False


def export():
	os.makedirs(os.path.dirname(OUT), exist_ok=True)
	bpy.ops.object.select_all(action="DESELECT")
	for name in ("Ball", "Stripes", "Trail", "Title"):
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
render_ball_env()
