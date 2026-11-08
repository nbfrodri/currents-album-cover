// Reposo: tras unos segundos sin tocar nada, la portada empieza a balancearse sola, siempre
// mostrando la parte de delante. Cualquier gesto la devuelve con suavidad al control del usuario.
export const IDLE_DELAY = 5; // segundos sin entrada antes de empezar
const RAMP = 2.5; // segundos para entrar en el balanceo (y algo menos para salir)
const SWAY = 0.5; // radianes: unos ±29°, la parte de atrás nunca llega a verse
const SPEED = 0.35; // radianes de fase por segundo: un vaivén lento

export function createIdle() {
	let still = 0; // segundos sin entrada
	let weight = 0; // 0: control del usuario · 1: balanceo pleno
	let phase = 0;

	return {
		poke() {
			still = 0;
		},
		// devuelve el giro extra (radianes) y cuánto pesa el reposo en este momento
		update(dt) {
			still += dt;
			const target = still >= IDLE_DELAY ? 1 : 0;
			weight += Math.sign(target - weight) * Math.min(Math.abs(target - weight), dt / (target ? RAMP : RAMP / 3));
			if (weight > 0) phase += dt * SPEED;
			else phase = 0; // vuelve a empezar desde el frente
			const ease = weight * weight * (3 - 2 * weight);
			return { angle: ease * SWAY * Math.sin(phase), weight: ease };
		},
	};
}
