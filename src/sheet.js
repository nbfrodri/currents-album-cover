import { formatTime, seconds } from "./tracks.js";

// Ficha del álbum (a la izquierda): cuatro datos del disco y el tema que suena. Se puede
// recoger hasta dejar solo el título y el botón de desplegar. update recibe cada estado del
// reproductor; antes de que suene nada invita a pulsar la bola.
export function mountSheet(doc, tracks) {
	const $ = (selector) => doc.querySelector(selector);
	const sheet = $("#sheet");
	const toggle = $("#sheet-toggle");
	const track = $("#sheet-track");
	const meta = $("#sheet-track-meta");
	const total = tracks.reduce((sum, t) => sum + seconds(t.time), 0);
	$("#sheet-total").textContent = `${tracks.length} temas`;
	$("#sheet-length").textContent = `${formatTime(total)} de música`;

	let collapsed = false;
	toggle.addEventListener("click", () => {
		collapsed = !collapsed;
		sheet.classList.toggle("collapsed", collapsed);
		toggle.setAttribute("aria-expanded", String(!collapsed));
		toggle.setAttribute("aria-label", collapsed ? "Desplegar la ficha" : "Recoger la ficha");
	});

	let started = false;
	function update(state) {
		started ||= state.playing;
		if (!started) return;
		const number = String(state.index + 1).padStart(2, "0");
		track.textContent = tracks[state.index].title;
		meta.textContent = `${state.playing ? "Reproduciendo" : "En pausa"} · ${number} de ${tracks.length}`;
	}

	return { update };
}
