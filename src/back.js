// Tracklist de la contraportada: Blender exporta en BackArt (extras de glTF) dónde están sus filas,
// en coordenadas vistas desde detrás: línea base v = top - k * step, u en [-half, half] y el texto
// sube cap por encima de la línea base. En el modelo, x = -u y z = -v.
const centre = (k, rows) => rows.top - k * rows.step + (rows.cap ?? 0) / 2;
export function backTrackAt(point, rows) {
	if (!rows) return -1;
	const u = -point.x;
	const v = -point.z;
	const k = Math.round((rows.top + (rows.cap ?? 0) / 2 - v) / rows.step);
	const offRow = Math.abs(centre(k, rows) - v) > rows.step * 0.5;
	if (k < 0 || k >= rows.count || offRow || Math.abs(u) > rows.half) return -1;
	return k;
}

// Franja de una fila: centrada en sus mayúsculas, sin invadir las filas vecinas
export function backRowCenter(index, rows) {
	return { x: 0, z: -centre(index, rows), height: Math.min((rows.cap ?? rows.step / 2) * 1.8, rows.step * 0.75) };
}
