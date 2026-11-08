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

// Un botón por tema: al pulsarlo suena ese tema
function renderTracks(doc, list, tracks, player) {
	return tracks.map((track, i) => {
		const button = doc.createElement("button");
		button.type = "button";
		button.append(span(doc, "n", String(i + 1).padStart(2, "0")), span(doc, "t", track.title), span(doc, "", track.time, "time"));
		button.addEventListener("click", () => player.play(i));
		const item = doc.createElement("li");
		item.append(button);
		list.append(item);
		return button;
	});
}

// Volumen y silencio; el último volumen se recuerda en este navegador
function wireVolume(volumeInput, muteButton, player) {
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
}

// Barra de progreso: el evento timeupdate del audio solo llega ~4 veces por segundo y la barra iba
// a saltos; tick() la mueve en cada fotograma mientras suena. El texto solo cambia cada segundo.
function wireProgress(seekInput, timeCurrent, panel, player) {
	let seeking = false;
	let shownTime = "";
	function showProgress(state) {
		const duration = Number.isFinite(state.duration) ? state.duration : 0;
		if (!seeking) seekInput.value = state.current;
		seekInput.style.setProperty("--progress", `${duration ? (state.current / duration) * 100 : 0}%`);
		const time = formatTime(state.current);
		if (time !== shownTime) timeCurrent.textContent = shownTime = time;
	}
	function tick() {
		if (panel.hidden) return;
		const state = player.state();
		if (state.playing) showProgress(state);
	}
	seekInput.addEventListener("input", () => {
		seeking = true;
		player.seek(Number(seekInput.value));
		seeking = false;
	});
	return { showProgress, tick };
}

// Panel del reproductor: tema actual, controles, barra de progreso y tracklist clicable. Se abre
// solo al empezar un tema; se puede minimizar a una barra o recogerlo al mínimo con la X (solo
// el nombre del álbum y el botón de maximizar). Oculto con T o CURRENTS, no vuelve a abrirse solo hasta el siguiente tema. onState recibe cada cambio del reproductor (para que la portada
// reaccione). Devuelve setOpen, tick (avanza la barra de progreso en cada fotograma) y el lienzo del
// visualizador para el bucle de render.
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
	const minButton = $("#player-min");

	const setOpen = (open) => (panel.hidden = !open);
	// "full", "minimized" (una barra con el tema y el progreso) o "collapsed" (el nombre del
	// álbum, el botón de maximizar y las rayas del visualizador)
	let view = "full";
	function setView(value) {
		view = value;
		panel.classList.toggle("minimized", view === "minimized");
		panel.classList.toggle("collapsed", view === "collapsed");
		minButton.setAttribute("aria-expanded", String(view === "full"));
		minButton.setAttribute("aria-label", view === "full" ? "Minimizar el reproductor" : "Desplegar el reproductor");
	}
	const collapse = () => setView("collapsed");
	minButton.addEventListener("click", () => setView(view === "full" ? "minimized" : "full"));
	// la X no quita el reproductor: lo recoge al mínimo para que la música siga a mano
	$("#player-close").addEventListener("click", collapse);
	$("#album-total").textContent = `${tracks.length} temas · ${formatTime(tracks.reduce((sum, t) => sum + seconds(t.time), 0))}`;


	const trackButtons = renderTracks(doc, $("#tracks"), tracks, player);

	const { showProgress, tick } = wireProgress(seekInput, timeCurrent, panel, player);
	let shownFor = null; // tema para el que ya se abrió solo: cerrado, sigue cerrado hasta otro
	player.onChange((state) => {
		if (state.playing && state.index !== shownFor) {
			shownFor = state.index;
			setOpen(true);
		}
		panel.classList.toggle("playing", state.playing);
		playButton.setAttribute("aria-label", state.playing ? "Pausar" : "Reproducir");
		nowLabel.textContent = `${state.playing ? "Reproduciendo" : "En pausa"} · ${String(state.index + 1).padStart(2, "0")}`;
		nowTitle.textContent = tracks[state.index].title;
		trackButtons.forEach((button, i) => button.setAttribute("aria-current", String(i === state.index)));
		const duration = Number.isFinite(state.duration) ? state.duration : 0;
		seekInput.max = duration;
		showProgress(state);
		timeTotal.textContent = formatTime(duration);
		volumeInput.value = state.volume;
		volumeInput.style.setProperty("--progress", `${state.muted ? 0 : state.volume * 100}%`);
		muteButton.setAttribute("aria-pressed", String(state.muted));
		muteButton.setAttribute("aria-label", state.muted ? "Activar el sonido" : "Silenciar");
		sourceNote.textContent = state.failed ? "No se pudo cargar el audio. Comprueba la conexión." : "";
		onState(state);
	});
	playButton.addEventListener("click", () => player.toggle());
	$("#prev").addEventListener("click", () => player.prev());
	$("#next").addEventListener("click", () => player.next());


	// abre el reproductor minimizado si estaba cerrado (al tocar la bola): no tapa la portada
	function reveal() {
		if (!panel.hidden) return;
		setView("minimized");
		setOpen(true);
	}

	wireVolume(volumeInput, muteButton, player);

	return { setOpen, reveal, collapse, tick, context: canvas.getContext("2d"), width: canvas.width, height: canvas.height };
}
