"""Rayas como curvas de nivel de un flujo con remolinos en la estela diagonal.

Las rotaciones locales arrastran juntas las rayas vecinas: forman eses y horquillas
redondas, sin la repetición de una onda sinusoidal. El canal de la cola pertenece al
mismo campo. Fuera del abanico detrás de la bola se conserva el flujo potencial.
Coordenadas de imagen (0..1, y hacia abajo); numpy, sin dependencia de Blender.
"""
import numpy as np

TAU = 2 * np.pi


def smoothstep(e0, e1, x):
	t = np.clip((x - e0) / (e1 - e0), 0.0, 1.0)
	return t * t * (3 - 2 * t)


class Flow:
	# Centro longitudinal/lateral, radios y giro de cada pliegue de pintura.
	# Los signos alternos producen horquillas y gotas, no una corrugación periódica.
	CURLS = (
		(0.075, -0.115, 0.080, 0.055, 2.2),
		(0.14, 0.105, 0.075, 0.058, -2.5),
		(0.23, -0.125, 0.095, 0.075, -2.9),
		(0.29, 0.125, 0.090, 0.068, 3.1),
		(0.35, -0.255, 0.085, 0.070, 2.8),
		(0.43, -0.115, 0.090, 0.075, 3.2),
		(0.46, 0.255, 0.110, 0.080, -3.0),
		(0.51, 0.110, 0.095, 0.072, -3.2),
		(0.59, -0.265, 0.105, 0.090, -3.2),
		(0.64, -0.080, 0.100, 0.075, 3.0),
	)

	def __init__(self, ball, flow_r, turbulence, wave_lift):
		self.ball = np.asarray(ball, dtype=float)
		self.dir = self.ball / np.linalg.norm(self.ball)
		self.perp = np.array([-self.dir[1], self.dir[0]])
		self.flow_r = flow_r
		self.turbulence = turbulence
		self.wave_lift = wave_lift

	def along_across(self, x, y):
		rx, ry = x - self.ball[0], y - self.ball[1]
		return rx * self.dir[0] + ry * self.dir[1], rx * self.perp[0] + ry * self.perp[1]

	def psi(self, x, y):
		a, c = self.along_across(x, y)
		return c * (1 - self.flow_r ** 2 / np.maximum(a * a + c * c, 1e-9))

	def mask(self, x, y):
		"""Abanico diagonal: el lado inferior izquierdo sigue siendo tranquilo."""
		a, c = self.along_across(x, y)
		width = 0.10 + 0.48 * np.maximum(a, 0)
		return smoothstep(-0.025, 0.11, a) * (1 - smoothstep(width, width + 0.09, np.abs(c)))

	@staticmethod
	def tail(a):
		"""Dos eses largas; la cola vuelve al eje que sale cerca de x=0.85."""
		return 0.017 * smoothstep(0.07, 0.16, a) * np.sin((a - 0.10) * TAU / 0.20)

	def base(self, x, y):
		a, _ = self.along_across(x, y)
		return self.psi(x, y) - self.mask(x, y) * self.tail(a)

	def field(self, x, y):
		a, _ = self.along_across(x, y)
		base = self.base(x, y)
		v = base
		for ca, cc, ra, rc, angle in self.CURLS:
			da, dc = (a - ca) / ra, (base - cc) / rc
			theta = angle * np.exp(-1.4 * (da * da + dc * dc))
			cs, sn = np.cos(theta), np.sin(theta)
			v = v + rc * (da * sn + dc * (cs - 1))
		# Se reserva un canal con signo constante: ninguna raya atraviesa la cola.
		amplitude = 0.020 + 0.016 * smoothstep(0.10, 0.60, a)
		v += amplitude * np.sin(48 * a + 2.5 * np.sin(19 * base)) + 0.008 * np.sin(73 * a - 27 * base + 1.3)
		calm = smoothstep(0.022, 0.065, np.abs(base))
		return base + self.mask(x, y) * calm * (v - base) * self.turbulence

	def lift(self, x, y):
		"""Relieve bajo y ancho: no convierte los pliegues en una superficie inclinada."""
		a, c = self.along_across(x, y)
		return self.mask(x, y) * self.wave_lift * (0.5 + 0.25 * np.sin(25 * a + 12 * c) + 0.25 * np.cos(34 * c - 8 * a))

	def relief(self, points, period, width):
		"""Ancho según separación real; sombra en pliegues, aglomeraciones y el hoyo."""
		x, y = np.asarray(points).T
		e = 0.0006
		f = self.field(x, y)
		fxp, fxm = self.field(x + e, y), self.field(x - e, y)
		fyp, fym = self.field(x, y + e), self.field(x, y - e)
		fx, fy = (fxp - fxm) / (2 * e), (fyp - fym) / (2 * e)
		gradient = np.maximum(np.hypot(fx, fy), 0.15)
		fxx, fyy = (fxp + fxm - 2 * f) / e ** 2, (fyp + fym - 2 * f) / e ** 2
		fxy = (self.field(x + e, y + e) - self.field(x + e, y - e)
			- self.field(x - e, y + e) + self.field(x - e, y - e)) / (4 * e ** 2)
		curvature = np.abs(fxx * fy ** 2 - 2 * fxy * fx * fy + fyy * fx ** 2) / gradient ** 3
		widths = np.minimum(width * 1.2, period * 0.64 / gradient)
		widths = np.minimum(widths, 0.45 / np.maximum(curvature, 1))
		fold = smoothstep(12, 95, curvature) * self.mask(x, y)
		crowd = smoothstep(1.4, 4.5, gradient)
		r = np.hypot(x - self.ball[0], y - self.ball[1])
		pocket = np.exp(-((r - self.flow_r) / 0.055) ** 2)
		a, c = self.along_across(x, y)
		region = 0.88 + 0.12 * np.sin(12 * a + 7 * c) * np.cos(16 * c - 4 * a)
		shade = region * (1 - 0.20 * fold) * (1 - 0.14 * crowd) * (1 - 0.36 * pocket)
		return widths, shade


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
		segments = SEGMENTS[case[i, j]]
		if case[i, j] in (5, 10):
			# Decisor asintótico: mantiene la misma topología entre niveles vecinos.
			q = (v0[i, j] - level) * (v2[i, j] - level) - (v1[i, j] - level) * (v3[i, j] - level)
			segments = ((0, 1), (2, 3)) if q > 0 else ((3, 0), (1, 2))
		for ea, eb in segments:
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
