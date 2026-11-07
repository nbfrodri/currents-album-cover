// Latido de la bola al ritmo: una envolvente que sigue los graves y los compara con su media de
// los últimos segundos. Cada bombo la hincha deprisa y luego se deshincha despacio, así que la
// bola respira con el ritmo en vez de dar un chasquido. Devuelve un pulso 0..1.
const ATTACK = 0.06; // s: lo que tarda en hincharse con un golpe
const RELEASE = 0.28; // s: lo que tarda en volver (antes del siguiente golpe a ~120 bpm)
const MEMORY = 1.5; // s: media de graves con la que se compara
const FLOOR = 0.08; // por debajo de esto es silencio o ruido: no late
const RANGE = 0.5; // un golpe que supera la media en esta fracción da el latido completo

const follow = (value, target, time, dt) => value + (target - value) * Math.min(1, dt / time);

export function createBeat() {
	let envelope = null;
	let average = null;
	let last = 0;
	let age = 99; // segundos desde el último golpe (para las ondas que salen de la bola)
	let warm = 0; // segundos con señal desde el último silencio
	return {
		get age() {
			return age;
		},
		update(bass, dt) {
			envelope ??= bass; // arrancar no es un golpe
			average ??= bass;
			// al arrancar (o tras un silencio) la media aún no sabe cómo suena el tema: aprende deprisa
			// (memoria corta que crece hasta MEMORY) y el latido entra poco a poco; si no, la bola se
			// queda inflada los primeros segundos tras pulsarla
			warm = bass > FLOOR ? warm + dt : 0;
			envelope = follow(envelope, bass, bass > envelope ? ATTACK : RELEASE, dt);
			average = follow(average, bass, Math.min(MEMORY, 0.1 + warm), dt);
			const excess = bass > FLOOR ? (envelope - average) / Math.max(average * RANGE, 0.02) : 0;
			const pulse = Math.min(Math.max(excess, 0), 1) * Math.min(warm / MEMORY, 1);
			age = pulse > 0.5 && last <= 0.5 ? 0 : age + dt;
			last = pulse;
			return pulse;
		},
	};
}

// Cuánto se hincha la bola con un pulso: igual que el pulso en los golpes normales y, por encima
// de KNEE, comprimido, para que un golpe que destaca mucho (p. ej. tras un pasaje tranquilo o al
// cambiar de tema) no la infle de más. Máximo: 1 + SWELL·(KNEE + (1 − KNEE)·0,3).
const SWELL = 0.18;
const KNEE = 0.6;
export function ballSwell(pulse) {
	const soft = pulse <= KNEE ? pulse : KNEE + (pulse - KNEE) * 0.3;
	return 1 + soft * SWELL;
}
