import { formatTime, seconds } from "./tracks.js";

const VOLUME_KEY = "currents-volume"; // comodidad de cada visitante: el último volumen elegido
function savedVolume() {
	try {
		const value = Number(localStorage.getItem(VOLUME_KEY));
		return localStorage.getItem(VOLUME_KEY) !== null && Number.isFinite(value) ? value : 1;
	} catch {
		return 1;
	}
}

function span(doc, className, text, tag = "span") {
	const el = doc.createElement(tag);
	el.className = className;
	el.textContent = text;
	return el;
}

// Panel del reproductor: tema actual, controles, barra de progreso y tracklist clicable.
// onState recibe cada cambio del reproductor (para que la portada reaccione).
// Devuelve el lienzo del visualizador para que el bucle de render lo dibuje.
export function mountPanel(doc, player, tracks, onState) {
	const $ = (selector) => doc.querySelector(selector);
	const panel = $("#tracklist");
	const playButton = $("#play");
	const nowLabel = $("#now-label");
	const nowTitle = $("#now-title");
	const seekInput = $("#seek");
	const timeCurrent = $("#time-current");
	const timeTotal = $("#time-total");
	const sourceNote = $("#audio-source");
	const canvas = $("#viz");
	const volumeInput = $("#volume");
	const muteButton = $("#mute");
	$("#album-total").textContent = `${tracks.length} temas · ${formatTime(tracks.reduce((sum, t) => sum + seconds(t.time), 0))}`;

	const trackButtons = tracks.map((track, i) => {
		const button = doc.createElement("button");
		button.type = "button";
		button.append(span(doc, "n", String(i + 1).padStart(2, "0")), span(doc, "t", track.title), span(doc, "", track.time, "time"));
		button.addEventListener("click", () => player.play(i));
		const item = doc.createElement("li");
		item.append(button);
		$("#tracks").append(item);
		return button;
	});

	let seeking = false;
	player.onChange((state) => {
		panel.classList.toggle("playing", state.playing);
		playButton.setAttribute("aria-label", state.playing ? "Pausar" : "Reproducir");
		nowLabel.textContent = `${state.playing ? "Sonando" : "En pausa"} · ${String(state.index + 1).padStart(2, "0")}`;
		nowTitle.textContent = tracks[state.index].title;
		trackButtons.forEach((button, i) => button.setAttribute("aria-current", String(i === state.index)));
		const duration = Number.isFinite(state.duration) ? state.duration : 0;
		seekInput.max = duration;
		if (!seeking) seekInput.value = state.current;
		seekInput.style.setProperty("--progress", `${duration ? (state.current / duration) * 100 : 0}%`);
		timeCurrent.textContent = formatTime(state.current);
		timeTotal.textContent = formatTime(duration);
		volumeInput.value = state.volume;
		volumeInput.style.setProperty("--progress", `${state.muted ? 0 : state.volume * 100}%`);
		muteButton.setAttribute("aria-pressed", String(state.muted));
		muteButton.setAttribute("aria-label", state.muted ? "Activar el sonido" : "Silenciar");
		sourceNote.textContent = state.failed
			? "No se pudo cargar el audio. Comprueba la conexión."
			: state.source === "preview" ? "Preview oficial de 30 s · pon tus MP3 en public/audio para el tema completo" : "";
		onState(state);
	});
	playButton.addEventListener("click", () => player.toggle());
	$("#prev").addEventListener("click", () => player.prev());
	$("#next").addEventListener("click", () => player.next());
	seekInput.addEventListener("input", () => {
		seeking = true;
		player.seek(Number(seekInput.value));
		seeking = false;
	});

	volumeInput.addEventListener("input", () => {
		player.setVolume(Number(volumeInput.value));
		try {
			localStorage.setItem(VOLUME_KEY, volumeInput.value);
		} catch {
			// sin almacenamiento (modo privado): el volumen vale solo para esta visita
		}
	});
	muteButton.addEventListener("click", () => player.toggleMute());
	player.setVolume(savedVolume());

	return { context: canvas.getContext("2d"), width: canvas.width, height: canvas.height };
}
