import { formatTime, seconds } from "./tracks.js";

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

	return { context: canvas.getContext("2d"), width: canvas.width, height: canvas.height };
}
