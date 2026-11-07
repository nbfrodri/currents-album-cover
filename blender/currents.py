"""Genera en Blender la portada 'Currents' completa y la exporta a public/models/currents.glb.

Referencia: la portada original de Robert Beatty. Toda la portada se hace aquí (forma, color,
materiales y texto); la web solo la carga y añade la interacción.
- Stripes: ~140 rayas lila (tubos planos), curvas de nivel de un campo de corriente (blender/flow.py):
  flujo potencial alrededor de la bola más remolinos en su estela diagonal. Rectas hasta la
  bola y, por debajo, meandros psicodélicos que se pliegan en eses y gotas y suben en altura. El color (lila que se
  oscurece arriba a la derecha, con luces de cresta y sombras en los pliegues) va en sus vértices.
- Trail: una sola línea por el hueco central (psi = 0), a ras de las rayas: hilo rojo fino y recto,
  mancha rosa al llegar a la bola, pasa por debajo y sale como cola ondulada naranja y amarilla.
- Ball: bola de cromo gris satinado hundida en un hoyo de la superficie.
- TitleBand y TitleAlbum: "TAME IMPALA" y "CURRENTS" en naranja (Archivo Expanded), piezas
  separadas para que la web las haga clicables.
- Body: cuerpo negro del álbum (la superficie con el hoyo de la bola, los cantos y el reverso): los
  huecos entre rayas se ven negros, como en el original, y por detrás no se ve la bola.
- BackArt: contraportada en el reverso, con rayas lila, título y el tracklist.
- public/models/ball_env.jpg: panorámica renderizada desde el centro de la bola (rayas, cielo de
  estudio y una ventana de luz arriba a la izquierda) que la web usa como reflejo del cromo.
Coordenadas de cálculo "de imagen" (0..1, y hacia abajo), medidas sobre la portada original.
Ejecutar desde Blender: CURRENTS_PATH = ".../blender/currents.py"; exec(open(CURRENTS_PATH).read())
"""
import math
import os
import sys

import bmesh
import bpy
import numpy as np
from mathutils import Matrix, Vector

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(globals().get("CURRENTS_PATH") or __file__)))
OUT = os.path.join(ROOT, "public", "models", "currents.glb")
ENV_OUT = os.path.join(ROOT, "public", "models", "ball_env.jpg")
FONT = os.path.join(ROOT, "blender", "fonts", "ArchivoExpanded-Bold.ttf")
sys.path.insert(0, os.path.join(ROOT, "blender"))
from flow import Flow, contours, simplify  # noqa: E402

BALL = Vector((0.53, 0.62))  # imagen
BALL_R = 0.105  # imagen (la portada mide 1)
DIR = BALL.normalized()  # trayectoria: de la esquina (0, 0) al centro de la bola
PERP = Vector((-DIR.y, DIR.x))

PERIOD = 1 / 100  # separación entre rayas en unidades de psi
GAP = 0.014  # medio hueco central (psi) por donde pasa la estela
STRIPE_WIDTH = 0.0062  # ancho de cada raya lila (imagen)
STRIPE_HEIGHT = 0.0022  # grosor de cada raya (imagen)
TURBULENCE = 1.0  # intensidad del arrastre dentro de los remolinos
GRID = 860  # resolución de la rejilla sobre la que se trazan las curvas de nivel
WAVE_LIFT = 0.018  # amplitud en altura de las ondas (imagen): relieve visible al girar
SIDES = 8
FLOW_R = BALL_R * 0.85  # radio del flujo: algo menor que la bola para que las rayas se peguen a ella
DENT = 0.075  # profundidad del hoyo que hace la bola en la superficie (imagen)
DENT_WIDTH = 0.11  # alcance del hoyo desde el centro de la bola (imagen)
SINK = 0.45  # altura del centro de la bola sobre el fondo del hoyo, en radios
TITLE_WIDTH = 0.255  # ancho de "TAME IMPALA" en la portada original (imagen)
TITLE_LIFT = 0.07  # el texto flota por delante de la superficie (imagen): capa propia para el parallax
# grosor del cuerpo del álbum bajo la superficie (imagen): la bola baja (1 - SINK) radios por debajo
# del fondo de su hoyo, y el reverso queda un poco más abajo para que nunca lo atraviese
BACK_DEPTH = DENT + BALL_R * (1 - SINK) + 0.015
BACK_ROWS = {"top": 0.6, "step": 0.075, "half": 0.86}  # filas del tracklist del reverso (u, v)
TRAIL_THIN = 0.0032  # medio ancho del hilo rojo (imagen)
SMEAR = 0.2  # distancia antes de la bola en la que el hilo se abre en una mancha rosa (imagen)
SMEAR_WIDTH = 0.026  # medio ancho de la mancha junto a la bola (imagen)
TAIL_WIDTH = 0.012  # medio ancho de la cola ondulada (imagen)
# Se modela con un pequeño margen fuera de la portada: al girarla, el marco de la web recorta lo que sobra
DOMAIN_X = (-0.06, 1.06)
DOMAIN_Y = (-0.06, 1.06)

# Colores tomados de la portada original (sRGB)
LILAC_NEAR = (0.9, 0.75, 1.0)
LILAC_FAR = (0.10, 0.035, 0.17)
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
	far *= 1 - smoothstep(0.4, 0.95, y)
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


def dent(p):
	"""Hoyo suave alrededor de la bola: la superficie cede bajo su peso (valor negativo)."""
	r = (p - BALL).length
	return -DENT * math.exp(-((r / DENT_WIDTH) ** 2))


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


def add_tube(bm, uv_layer, run, half_w, half_h, uv_of, colors=None):
	"""Tubo de sección elíptica sobre la polilínea run = [(p_imagen, lift, extra), ...]."""
	pts = [to_world(p, lift) for p, lift, _ in run]
	closed = (pts[0] - pts[-1]).length < 1e-7
	rings = []
	col = None
	if colors is not None:
		col = bm.loops.layers.float_color.get("Col") or bm.loops.layers.float_color.new("Col")
	for i, (p, _, extra) in enumerate(run):
		before = (i - 1) % (len(pts) - 1) if closed else max(i - 1, 0)
		after = (i + 1) % (len(pts) - 1) if closed else min(i + 1, len(pts) - 1)
		t = pts[after] - pts[before]
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
		# Luz de cresta horneada: persiste también bajo las luces de la web.
		shades = []
		if colors is not None:
			for k in range(SIDES):
				light = 0.43 + 0.57 * max(0, math.sin(2 * math.pi * k / SIDES))
				shades.append((*to_linear(tuple(v * light for v in colors[i])), 1.0))
		rings.append((ring, uv_of(p, extra), shades))
	for i in range(len(rings) - 1):
		(r0, uv0, col0), (r1, uv1, col1) = rings[i], rings[i + 1]
		for k in range(SIDES):
			k2 = (k + 1) % SIDES
			face = bm.faces.new((r0[k], r1[k], r1[k2], r0[k2]))
			for loop, uv in zip(face.loops, (uv0, uv1, uv1, uv0)):
				loop[uv_layer].uv = uv
			if col is not None:
				for loop, color in zip(face.loops, (col0[k], col1[k], col1[k2], col0[k2])):
					loop[col] = color


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


FLOW = Flow(BALL, FLOW_R, TURBULENCE, WAVE_LIFT)


def flow_grid():
	"""El campo de corriente muestreado en una rejilla sobre el dominio; bajo la bola, sin datos."""
	step = (DOMAIN_X[1] - DOMAIN_X[0]) / GRID
	gy, gx = np.mgrid[0:GRID + 1, 0:GRID + 1]
	x, y = DOMAIN_X[0] + gx * step, DOMAIN_Y[0] + gy * step
	values = FLOW.field(x, y)
	values[np.hypot(x - BALL.x, y - BALL.y) < BALL_R * 0.97] = np.nan
	return values, step


def level_lines(values, step, level):
	"""Curvas psi = level en coordenadas de imagen, sin puntos de sobra en los tramos rectos."""
	for line in contours(values, level):
		pts = simplify([(DOMAIN_X[0] + j * step, DOMAIN_Y[0] + i * step) for i, j in line])
		if len(pts) > 3:
			yield [Vector(p) for p in pts]


def height(p):
	return float(FLOW.lift(p.x, p.y)) + dent(p)


def build_stripes(mat, values, step):
	bm = bmesh.new()
	uv_layer = bm.loops.layers.uv.new("UVMap")
	for side in (-1, 1):
		k = 0
		while True:
			c = side * (GAP + PERIOD * (k + 0.5))
			k += 1
			if abs(c) > 0.9:
				break
			for pts in level_lines(values, step, c):
				widths, shades = FLOW.relief(pts, PERIOD, STRIPE_WIDTH)
				run = [(p, height(p), w) for p, w in zip(pts, widths)]
				colors = [tuple(v * shade for v in stripe_color(p)) for p, shade in zip(pts, shades)]
				add_tube(bm, uv_layer, run, lambda w: w / 2, STRIPE_HEIGHT / 2, lambda p, _: (p.x, p.y), colors)
	return finish_mesh("Stripes", bm, mat)


def trail_width(a):
	"""Medio ancho de la estela (imagen), medido sobre la portada original: hilo rojo muy fino,
	mancha rosa que se abre al llegar a la bola y cola ancha al salir por debajo."""
	if a < -SMEAR:
		return TRAIL_THIN
	if a < 0:
		return TRAIL_THIN + (SMEAR_WIDTH - TRAIL_THIN) * smoothstep(-SMEAR, -BALL_R * 0.6, a)
	return TAIL_WIDTH + (SMEAR_WIDTH - TAIL_WIDTH) * (1 - smoothstep(BALL_R, BALL_R + 0.08, a))


def trail_path(values, step):
	"""Recta por el hueco central hasta pasar bajo la bola; detrás sigue la curva psi = 0 de la
	estela, con los mismos meandros que las rayas. Devuelve [(p_imagen, avance a), ...]."""
	start = BALL.length + 0.1  # empieza justo fuera de la portada, arriba a la izquierda
	path = [(BALL + DIR * a, a) for a in np.linspace(-start, BALL_R * 0.97, 240)]
	exit_point = BALL + DIR * BALL_R
	lines = list(level_lines(values, step, 0.0))
	best = min(lines, key=lambda pts: min((pts[0] - exit_point).length, (pts[-1] - exit_point).length))
	if (best[-1] - exit_point).length < (best[0] - exit_point).length:
		best.reverse()
	a, prev = path[-1][1], path[-1][0]
	for p in best:
		a += (p - prev).length
		path.append((p, a))
		prev = p
	return path


def build_trail(mat, values, step):
	"""Una sola línea por el hueco central (psi = 0), a ras de las rayas: entra recta por la
	esquina, pasa por debajo de la bola y sale por abajo con los meandros de la estela."""
	bm = bmesh.new()
	uv_layer = bm.loops.layers.uv.new("UVMap")
	line = [(p, height(p) + 0.0006, a) for p, a in trail_path(values, step)]  # apenas por encima
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
	bsdf.inputs["Coat Weight"].default_value = 0.18
	bsdf.inputs["Coat Roughness"].default_value = 0.35
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


TRACKS = (
	("Let It Happen", "7:47"), ("Nangs", "1:47"), ("The Moment", "4:15"), ("Yes I'm Changing", "4:30"),
	("Eventually", "5:19"), ("Gossip", "0:55"), ("The Less I Know the Better", "3:36"),
	("Past Life", "3:48"), ("Disciples", "1:48"), ("'Cause I'm a Man", "4:01"),
	("Reality in Motion", "4:12"), ("Love/Paranoia", "3:05"), ("New Person, Same Old Mistakes", "6:03"),
)


def add_text(body, location, size, align="LEFT", back=False):
	"""Texto convertido a malla; back=True lo gira para leerse desde el reverso."""
	bpy.ops.object.text_add(location=location, rotation=(0, math.pi, 0) if back else (0, 0, 0))
	obj = bpy.context.active_object
	obj.data.body = body
	obj.data.align_x = align
	obj.data.font = bpy.data.fonts.load(FONT, check_existing=True)
	obj.data.size = size
	obj.data.extrude = 0.003
	obj.data.resolution_u = 3  # letras pequeñas: con pocas subdivisiones basta
	bpy.ops.object.convert(target="MESH")
	return obj


def title_size():
	"""Cuerpo del título para que "TAME IMPALA" mida lo mismo que en la portada original."""
	probe = add_text("TAME IMPALA", (0, 0, 0), 0.05)
	size = 0.05 * TITLE_WIDTH * 2 / probe.dimensions.x
	bpy.data.objects.remove(probe, do_unlink=True)
	return size


def build_title(size):
	"""Texto naranja de la banda superior, como en la portada: dos piezas clicables en la web."""
	mat = material("Title", TITLE_ORANGE, 0.0, 0.5, emission=1.0)
	for name, body, x, align in (("TitleBand", "TAME IMPALA", 0.035, "LEFT"), ("TitleAlbum", "CURRENTS", 0.965, "RIGHT")):
		obj = add_text(body, to_world(Vector((x, 0.042)), TITLE_LIFT), size, align)
		obj.name = obj.data.name = name
		obj.data.materials.clear()
		obj.data.materials.append(mat)


def build_body():
	"""Cuerpo negro: superficie con el hoyo de la bola (justo bajo las rayas), cantos y reverso."""
	n = 160
	bottom = -BACK_DEPTH
	bm = bmesh.new()
	top = [[bm.verts.new(to_world(Vector((i / n, j / n)), dent(Vector((i / n, j / n))) - 0.001)) for i in range(n + 1)]
		for j in range(n + 1)]
	for j in range(n):
		for i in range(n):
			bm.faces.new((top[j][i], top[j + 1][i], top[j + 1][i + 1], top[j][i + 1]))
	ring = [top[0][i] for i in range(n)] + [top[j][n] for j in range(n)]
	ring += [top[n][i] for i in range(n, 0, -1)] + [top[j][0] for j in range(n, 0, -1)]
	low = [bm.verts.new((v.co.x, v.co.y, bottom * 2)) for v in ring]
	for k in range(len(ring)):
		k2 = (k + 1) % len(ring)
		bm.faces.new((ring[k], ring[k2], low[k2], low[k]))
	bm.faces.new(low)
	finish_mesh("Body", bm, material("Body", (0.025, 0.012, 0.035), 0.0, 0.8))


def build_back(size):
	"""Contraportada, para leerse desde detrás: título, tracklist y una banda de rayas lila.
	(u, v) son coordenadas vistas desde el reverso: u hacia la derecha del que mira, v hacia arriba."""
	z = -BACK_DEPTH * 2 - 0.002
	orange = material("BackTitle", TITLE_ORANGE, 0.0, 0.5, emission=1.0)
	lilac = material("BackLilac", LILAC_NEAR, 0.0, 0.5, emission=0.6)
	red = material("BackRed", RED, 0.0, 0.5, emission=0.8)

	def at(u, v, dz=0.0):
		return (-u, v, z - dz)

	parts = [(add_text("TAME IMPALA", at(-0.93, 0.84), size, "LEFT", True), orange),
		(add_text("CURRENTS", at(0.93, 0.84), size, "RIGHT", True), orange)]
	for k, (title, time) in enumerate(TRACKS):
		v = BACK_ROWS["top"] - k * BACK_ROWS["step"]
		parts.append((add_text(f"{k + 1:02d}", at(-BACK_ROWS["half"], v), size * 0.75, "LEFT", True), lilac))
		parts.append((add_text(title.upper(), at(-0.7, v), size * 0.75, "LEFT", True), orange))
		parts.append((add_text(time, at(BACK_ROWS["half"], v), size * 0.75, "RIGHT", True), lilac))

	bm = bmesh.new()  # banda de rayas lila abajo, cruzada por el hilo rojo
	for k in range(22):
		v = -0.5 - k * 0.021
		quad = [bm.verts.new(at(u, v + dv)) for u, dv in ((-1, 0), (1, 0), (1, -0.011), (-1, -0.011))]
		bm.faces.new(quad)
	stripes = finish_mesh("BackStripes", bm, lilac)
	bm = bmesh.new()
	# el hilo rojo, apenas por fuera de las rayas para que no se peleen en profundidad
	line = [bm.verts.new(at(u, v, 0.001)) for u, v in ((-1, -0.62), (1, -0.9), (1, -0.892), (-1, -0.612))]
	bm.faces.new(line)
	thread = finish_mesh("BackThread", bm, red)
	parts += [(stripes, lilac), (thread, red)]

	for obj, mat in parts:
		obj.data.materials.clear()
		obj.data.materials.append(mat)
	bpy.ops.object.select_all(action="DESELECT")
	for obj, _ in parts:
		obj.select_set(True)
	bpy.context.view_layer.objects.active = parts[0][0]
	bpy.ops.object.join()
	back = bpy.context.active_object
	back.name = back.data.name = "BackArt"
	# la web hace clicables las filas: dónde están, en el espacio del modelo glTF (y = altura)
	back["track_rows"] = {**BACK_ROWS, "count": len(TRACKS), "y": z}
	bm = bmesh.new()  # todas las caras hacia -Z, para que el reverso se vea desde detrás
	bm.from_mesh(back.data)
	for f in bm.faces:
		if f.normal.z > 0:
			f.normal_flip()
	bm.to_mesh(back.data)
	bm.free()


def clear_scene():
	for ob in list(bpy.data.objects):
		bpy.data.objects.remove(ob, do_unlink=True)
	for coll in (bpy.data.meshes, bpy.data.materials, bpy.data.cameras, bpy.data.lights, bpy.data.curves):
		for item in list(coll):
			if item.users == 0:
				coll.remove(item)


def build():
	clear_scene()
	values, step = flow_grid()
	build_stripes(vertex_color_material("Stripes", 0.5), values, step)
	build_trail(vertex_color_material("Trail", 0.35), values, step)
	build_body()

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

	size = title_size()
	build_title(size)
	build_back(size)


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
	# Una panorámica pequeña para cromo satinado no necesita rebotes profundos.
	# Limitar hilos evita la sobresuscripción de CPU en builds de contenedores.
	scene.render.threads_mode = "FIXED"
	scene.render.threads = min(8, os.cpu_count() or 1)
	scene.cycles.samples = 24
	scene.cycles.use_denoising = True
	scene.cycles.max_bounces = 4
	scene.cycles.diffuse_bounces = 2
	scene.cycles.glossy_bounces = 2
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
	for name in ("Ball", "Stripes", "Trail", "TitleBand", "TitleAlbum", "Body", "BackArt"):
		bpy.data.objects[name].select_set(True)
	bpy.ops.export_scene.gltf(
		filepath=OUT,
		export_format="GLB",
		use_selection=True,
		export_yup=True,
		export_normals=True,
		export_draco_mesh_compression_enable=True,
		export_extras=True,
	)
	print("exported", OUT, os.path.getsize(OUT), "bytes")


build()
export()
render_ball_env()
