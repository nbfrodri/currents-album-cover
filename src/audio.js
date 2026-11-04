export function createAmbient() {
	const chords = [
		[45, 52, 59, 64],
		[41, 48, 57, 64],
		[48, 55, 59, 62],
		[43, 50, 57, 62],
	];
	let context, master, filter, pan, voices;
	let active = false;
	let transition = null;
	let timer, nextChord, chord = 0;
	let tiltX = 0, tiltY = 0;
	const clamp = (value) => Number.isFinite(value) ? Math.max(-0.5, Math.min(0.5, value)) : 0;
	const frequency = (note) => 440 * 2 ** ((note - 69) / 12);

	function initialize() {
		context = new AudioContext();
		master = context.createGain();
		master.gain.value = 0;
		master.connect(context.destination);
		pan = context.createStereoPanner();
		pan.connect(master);
		filter = context.createBiquadFilter();
		filter.type = "lowpass";
		filter.frequency.value = 900;
		filter.Q.value = 0.5;
		filter.connect(pan);

		// Eco suave con realimentación estable y modulación de tipo chorus.
		const delay = context.createDelay(1);
		delay.delayTime.value = 0.28;
		const feedback = context.createGain();
		feedback.gain.value = 0.24;
		const wet = context.createGain();
		wet.gain.value = 0.22;
		filter.connect(delay);
		delay.connect(feedback).connect(delay);
		delay.connect(wet).connect(pan);

		function modulate(rate, depth, parameter) {
			const oscillator = context.createOscillator();
			const amount = context.createGain();
			oscillator.frequency.value = rate;
			amount.gain.value = depth;
			oscillator.connect(amount).connect(parameter);
			oscillator.start();
		}
		modulate(0.09, 0.006, delay.delayTime);
		modulate(0.035, 180, filter.frequency);

		// Dos voces ligeramente desafinadas por nota, a volumen moderado.
		const mix = context.createGain();
		mix.gain.value = 0.045;
		mix.connect(filter);
		voices = chords[0].flatMap((note) => [-6, 6].map((detune) => {
			const oscillator = context.createOscillator();
			oscillator.type = "triangle";
			oscillator.frequency.value = frequency(note);
			oscillator.detune.value = detune;
			oscillator.connect(mix);
			oscillator.start();
			return oscillator;
		}));
	}

	function setTilt(x, y) {
		tiltX = clamp(x);
		tiltY = clamp(y);
		if (!active) return;
		const now = context.currentTime;
		filter.frequency.setTargetAtTime(900 * 2 ** (tiltY * 2), now, 0.3);
		pan.pan.setTargetAtTime(tiltX * 1.4, now, 0.3);
	}

	function schedule() {
		const now = context.currentTime;
		if (now + 0.5 < nextChord) return;
		// El reloj de audio mantiene la progresión aunque se ralentice la pestaña.
		chord = (chord + 1) % chords.length;
		const start = Math.max(now, nextChord);
		voices.forEach((voice, i) => {
			voice.frequency.setTargetAtTime(frequency(chords[chord][Math.floor(i / 2)]), start, 1.8);
		});
		nextChord = start + 9;
	}

	async function change() {
		if (!context) initialize();
		if (!active) {
			await context.resume();
			active = true;
			setTilt(tiltX, tiltY);
			const now = context.currentTime;
			master.gain.cancelScheduledValues(now);
			master.gain.setValueAtTime(0, now);
			master.gain.linearRampToValueAtTime(0.55, now + 1.5);
			nextChord = now + 9;
			timer = setInterval(schedule, 250);
			return true;
		}
		clearInterval(timer);
		const now = context.currentTime;
		// cancelAndHoldAtTime no existe en Firefox: fijamos a mano el valor actual
		master.gain.cancelScheduledValues(now);
		master.gain.setValueAtTime(master.gain.value, now);
		master.gain.linearRampToValueAtTime(0, now + 1.5);
		await new Promise((resolve) => setTimeout(resolve, 1550));
		await context.suspend();
		active = false;
		return false;
	}

	return {
		async toggle() {
			// Serializa pulsaciones rápidas para no suspender un nuevo arranque.
			while (transition) await transition;
			transition = change();
			try {
				return await transition;
			} finally {
				transition = null;
			}
		},
		setTilt,
		get playing() { return active; },
	};
}
