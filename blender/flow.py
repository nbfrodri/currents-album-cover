"""Rayas de 'Currents' como curvas de nivel de un campo de corriente (numpy, sin bpy).

El campo es la función de corriente de un flujo potencial alrededor de la bola,
psi = d_perp * (1 - R^2 / r^2), más unos meandros que solo existen en la franja inferior de la
portada (bajo una línea casi horizontal que pasa por la bola, medida sobre el original). Los
meandros desplazan las rayas a lo ancho con una onda corta a lo largo del flujo y una fase que
cambia despacio: las rayas vecinas ondulan juntas, y donde la onda es más fuerte que el flujo se
pliegan en eses, bucles y gotas. Las curvas de nivel de un campo suave nunca se cruzan.
En el canal central (psi ≈ 0) la onda es larga y suave: por ahí pasa la cola de la estela.
Coordenadas "de imagen" (0..1, y hacia abajo).
"""
import numpy as np

TAU = 2 * np.pi
WAVELENGTH = 0.075  # meandros de la franja inferior (imagen)
TAIL_WAVELENGTH = 0.32  # eses suaves de la cola
CHANNEL = 0.035  # medio ancho del canal tranquilo alrededor de la cola (unidades de psi)


def smoothstep(e0, e1, x):
	t = np.clip((x - e0) / (e1 - e0), 0.0, 1.0)
	return t * t * (3 - 2 * t)


class Flow:
	def __init__(self, ball, flow_r, turbulence, wave_lift):
		self.ball = np.asarray(ball, dtype=float)
		self.dir = self.ball / np.linalg.norm(self.ball)  # de la esquina (0, 0) al centro de la bola
		self.perp = np.array([-self.dir[1], self.dir[0]])
		self.flow_r = flow_r
		self.turbulence = turbulence  # amplitud máxima de los meandros (unidades de psi)
		self.wave_lift = wave_lift

	def along_across(self, x, y):
		rx, ry = x - self.ball[0], y - self.ball[1]
		return rx * self.dir[0] + ry * self.dir[1], rx * self.perp[0] + ry * self.perp[1]

	def psi(self, x, y):
		a, c = self.along_across(x, y)
		return c * (1 - self.flow_r ** 2 / np.maximum(a * a + c * c, 1e-9))

	@staticmethod
	def depth(x, y):
		"""Cuánto se ha entrado en la franja ondulada: 0 por encima de la línea que va de
		(0, 0.6) a (1, 0.5) en el original, y crece hacia abajo."""
		return y - (0.6 - 0.1 * x)

	def mask(self, x, y):
		"""0 en la parte recta; 1 en la franja ondulada, con meandros que crecen hacia abajo."""
		d = self.depth(x, y)
		return smoothstep(-0.03, 0.06, d) * (0.35 + 0.65 * smoothstep(0.0, 0.3, d))

	@staticmethod
	def phase(x, y):
		"""Fase lenta: rayas vecinas ondulan casi igual, pero cambia cada pocas rayas."""
		return 6 * np.sin(8 * x + 2 * np.sin(6 * y)) + 4 * np.sin(10 * y - 5 * x + 1.0)

	@staticmethod
	def envelope(x, y):
		"""Amplitud variable (0.35..1): unas zonas se pliegan en bucles y otras solo ondulan."""
		return 0.675 + 0.325 * np.sin(7 * x - 3 * y + 2 * np.sin(5 * y + 1.3))

	def base(self, x, y):
		"""psi con las eses largas de la cola: su curva 0 es el camino de la estela."""
		a, _ = self.along_across(x, y)
		m = self.mask(x, y) * self.turbulence
		return self.psi(x, y) + m * 0.6 * np.sin(TAU * a / TAIL_WAVELENGTH + 0.4 * self.phase(x, y))

	def field(self, x, y):
		a, _ = self.along_across(x, y)
		base = self.base(x, y)
		phase = self.phase(x, y)
		calm = smoothstep(0.004, CHANNEL, np.abs(base))  # 0 en el canal de la cola, 1 fuera
		short = np.sin(TAU * a / WAVELENGTH + phase) + 0.5 * np.sin(TAU * a / (WAVELENGTH * 1.7) - 0.7 * phase)
		return base + self.mask(x, y) * self.turbulence * self.envelope(x, y) * calm * short / 1.5

	def lift(self, x, y):
		"""Altura de las ondas (imagen): lomas suaves, más largas que los meandros."""
		a, _ = self.along_across(x, y)
		return self.mask(x, y) * self.wave_lift * (0.5 + 0.5 * np.sin(TAU * a / (WAVELENGTH * 2.5) + 0.5 * self.phase(x, y)))


# Marching squares: esquinas de cada celda v0 (i, j), v1 (i, j+1), v2 (i+1, j+1), v3 (i+1, j);
# aristas e0 = v0-v1, e1 = v1-v2, e2 = v3-v2, e3 = v0-v3. Segmentos por caso (bit k = vk > nivel).
SEGMENTS = {
	1: ((3, 0),), 2: ((0, 1),), 3: ((3, 1),), 4: ((1, 2),), 5: ((3, 0), (1, 2)), 6: ((0, 2),),
	7: ((3, 2),), 8: ((2, 3),), 9: ((2, 0),), 10: ((0, 1), (2, 3)), 11: ((2, 1),), 12: ((1, 3),),
	13: ((1, 0),), 14: ((0, 3),),
}


def contours(values, level):
	"""Curvas de nivel de values (2D, NaN = sin datos) como listas de (fila, columna) fraccionarias."""
	rows, cols = values.shape
	v0, v1 = values[:-1, :-1], values[:-1, 1:]
	v2, v3 = values[1:, 1:], values[1:, :-1]
	valid = ~(np.isnan(v0) | np.isnan(v1) | np.isnan(v2) | np.isnan(v3))
	case = ((v0 > level) * 1 + (v1 > level) * 2 + (v2 > level) * 4 + (v3 > level) * 8) * valid
	n_h = rows * (cols - 1)

	def edge_id(i, j, e):
		# aristas horizontales: (i, j)-(i, j+1); verticales: (i, j)-(i+1, j)
		if e == 0:
			return i * (cols - 1) + j
		if e == 2:
			return (i + 1) * (cols - 1) + j
		return n_h + i * cols + j + (1 if e == 1 else 0)

	links = {}
	for i, j in zip(*np.nonzero((case > 0) & (case < 15))):
		for ea, eb in SEGMENTS[case[i, j]]:
			a, b = edge_id(i, j, ea), edge_id(i, j, eb)
			links.setdefault(a, []).append(b)
			links.setdefault(b, []).append(a)

	def point(e):
		if e < n_h:
			i, j = divmod(e, cols - 1)
			fa, fb = values[i, j], values[i, j + 1]
			return i, j + (level - fa) / (fb - fa)
		i, j = divmod(e - n_h, cols)
		fa, fb = values[i, j], values[i + 1, j]
		return i + (level - fa) / (fb - fa), j

	seen, lines = set(), []
	# primero las abiertas (extremo con un solo vecino), luego los bucles cerrados
	starts = [e for e, n in links.items() if len(n) == 1] + list(links)
	for start in starts:
		if start in seen:
			continue
		line, prev, cur = [start], None, start
		seen.add(start)
		while True:
			nxt = next((n for n in links[cur] if n != prev and n not in seen), None)
			if nxt is None:
				if len(line) > 2 and start in links[cur] and prev is not None:
					line.append(start)  # bucle cerrado
				break
			seen.add(nxt)
			line.append(nxt)
			prev, cur = cur, nxt
		lines.append([point(e) for e in line])
	return lines


def simplify(points, max_turn=0.06, max_step=0.03):
	"""Quita puntos en los tramos rectos: conserva los que giran o están lejos del anterior."""
	if len(points) < 3:
		return points
	pts = np.asarray(points)
	keep = [0]
	for k in range(1, len(pts) - 1):
		last = pts[keep[-1]]
		d0, d1 = pts[k] - last, pts[k + 1] - pts[k]
		n0, n1 = np.linalg.norm(d0), np.linalg.norm(d1)
		if n0 < 1e-12 or n1 < 1e-12:
			continue
		turn = np.arccos(np.clip(d0 @ d1 / (n0 * n1), -1, 1))
		if turn > max_turn or n0 > max_step:
			keep.append(k)
	keep.append(len(pts) - 1)
	return pts[keep]
