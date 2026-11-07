// Visualizador en el estilo de la portada: rayas lila paralelas que se derriten en ondas con la
// música, más fuertes en el centro (como los meandros bajo la bola).
const LINES = 9;
const STEP = 4; // px entre puntos de cada raya

export function stripePoints(width, height, freq, time) {
	const gap = height / (LINES + 1);
	const lines = [];
	for (let k = 0; k < LINES; k++) {
		const base = gap * (k + 1);
		const line = [];
		for (let x = 0; x <= width; x += STEP) {
			let y = base;
			if (freq) {
				const bin = Math.min(freq.length - 1, Math.floor((x / width) * freq.length * 0.6)); // graves a la izquierda
				const energy = freq[bin] / 255;
				const centre = Math.exp(-(((x / width - 0.5) / 0.3) ** 2));
				y += gap * 1.4 * energy * centre * Math.sin(x * 0.08 + time * 3 + k * 0.6) * Math.sin(x * 0.021 + time);
			}
			line.push([x, Math.min(Math.max(y, 0), height)]);
		}
		lines.push(line);
	}
	return lines;
}

export function drawVisualizer(ctx, width, height, freq, time) {
	ctx.clearRect(0, 0, width, height);
	ctx.lineWidth = 2;
	ctx.lineJoin = "round";
	stripePoints(width, height, freq, time).forEach((line, k) => {
		ctx.strokeStyle = `rgb(201 174 242 / ${0.45 + 0.06 * k})`;
		ctx.beginPath();
		line.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
		ctx.stroke();
	});
}
