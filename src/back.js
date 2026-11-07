// Tracklist de la contraportada: Blender exporta en BackArt (extras de glTF) dónde están sus filas,
// en coordenadas vistas desde detrás: v = top - k * step y u en [-half, half]. En el modelo,
// x = -u y z = -v.
export function backTrackAt(point, rows) {
	if (!rows) return -1;
	const u = -point.x;
	const v = -point.z;
	const k = Math.round((rows.top - v) / rows.step);
	const offRow = Math.abs(rows.top - k * rows.step - v) > rows.step * 0.5;
	if (k < 0 || k >= rows.count || offRow || Math.abs(u) > rows.half) return -1;
	return k;
}

export function backRowCenter(index, rows) {
	return { x: 0, z: -(rows.top - index * rows.step) };
}
