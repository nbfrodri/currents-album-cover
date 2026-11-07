import { localSource } from "./tracks.js";

const RESTART_AFTER = 3; // segundos: "anterior" reinicia el tema si ya ha avanzado más

// Bombo, graves, medios y agudos (0..1) de un espectro de bytes (bins de ~86 Hz con fft 512)
function bandLevels(freq) {
	const band = (from, to) => {
		let sum = 0;
		for (let k = from; k < to; k++) sum += freq[k];
		return sum / (to - from) / 255;
	};
	const n = freq.length;
	return { kick: band(1, 4), bass: band(1, 8), mid: band(8, Math.floor(n * 0.4)), high: band(Math.floor(n * 0.4), n), freq };
}

function createAnalyser(context, audio) {
	const analyser = context.createAnalyser();
	analyser.fftSize = 512;
	analyser.smoothingTimeConstant = 0.6; // poco suavizado: el bombo llega con golpe al latido
	context.createMediaElementSource(audio).connect(analyser);
	analyser.connect(context.destination);
	return analyser;
}

// Reproductor del disco: un solo <audio> que prueba primero el MP3 local y, si falla, el preview.
// El analizador (Web Audio) se crea con la primera reproducción, que ya es un gesto del usuario.
export function createPlayer(tracks, { createAudio = () => new Audio(), createContext = () => new AudioContext() } = {}) {
	let audio = null;
	let context = null;
	let analyser = null;
	let freq = null;
	let index = 0;
	let source = "local";
	let failed = false;
	let volume = 1;
	let muted = false;
	const listeners = new Set();

	const state = () => ({
		index,
		source,
		failed,
		volume,
		muted,
		playing: Boolean(audio && !audio.paused),
		current: audio?.currentTime ?? 0,
		duration: audio?.duration,
	});
	const emit = () => listeners.forEach((fn) => fn(state()));

	function ensureAudio() {
		if (audio) return;
		audio = createAudio();
		audio.crossOrigin = "anonymous"; // sin esto el analizador solo vería silencio
		audio.preload = "metadata";
		audio.volume = volume;
		audio.muted = muted;
		audio.addEventListener("error", () => {
			if (source === "local") {
				source = "preview";
				audio.src = tracks[index].preview;
				audio.play().catch(() => {});
			} else {
				failed = true;
			}
			emit();
		});
		audio.addEventListener("ended", () => next());
		for (const name of ["play", "pause", "timeupdate", "loadedmetadata"]) audio.addEventListener(name, emit);
	}

	function connect() {
		if (context) return;
		context = createContext();
		analyser = createAnalyser(context, audio);
		freq = new Uint8Array(analyser.frequencyBinCount);
	}

	function load(i) {
		index = (i + tracks.length) % tracks.length;
		source = "local";
		failed = false;
		audio.src = localSource(index);
	}

	async function play(i = index) {
		ensureAudio();
		if (i !== index || !audio.src) load(i);
		connect();
		await context.resume?.();
		try {
			await audio.play();
		} catch {
			// el MP3 local no existe: el evento "error" ya pasa al preview
		}
		emit();
	}

	function pause() {
		audio?.pause();
		emit();
	}

	const toggle = () => (audio && !audio.paused ? pause() : play());
	const next = () => play(index + 1);
	function prev() {
		if (audio && audio.currentTime > RESTART_AFTER) {
			audio.currentTime = 0;
			emit();
			return Promise.resolve();
		}
		return play(index - 1);
	}

	function seek(time) {
		if (!audio) return;
		const end = Number.isFinite(audio.duration) ? audio.duration : 0;
		audio.currentTime = Math.min(Math.max(time, 0), end);
		emit();
	}

	function setVolume(value) {
		volume = Math.min(Math.max(value, 0), 1);
		muted = false; // mover el volumen quita el silencio
		if (audio) Object.assign(audio, { volume, muted });
		emit();
	}

	function toggleMute() {
		muted = !muted;
		if (audio) audio.muted = muted;
		emit();
	}

	// Niveles y espectro completo para la portada y el visualizador
	function levels() {
		if (!analyser) return { kick: 0, bass: 0, mid: 0, high: 0, freq: null };
		analyser.getByteFrequencyData(freq);
		return bandLevels(freq);
	}

	return {
		play, pause, toggle, next, prev, seek, setVolume, toggleMute, levels, state,
		onChange(fn) {
			listeners.add(fn);
			return () => listeners.delete(fn);
		},
	};
}
