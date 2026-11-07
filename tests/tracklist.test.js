import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");

test("el tracklist lista los 13 temas y su duración total coincide con la cabecera", () => {
	const panel = html.match(/<section id="tracklist"[\s\S]*?<\/section>/)?.[0];
	assert.ok(panel, "falta la sección #tracklist");
	const times = [...panel.matchAll(/<time datetime="PT(\d+)M(\d+)S">/g)].map(([, m, s]) => +m * 60 + +s);
	assert.equal(times.length, 13);
	const total = times.reduce((a, b) => a + b, 0);
	const [, count, mm, ss] = panel.match(/(\d+) temas · (\d+):(\d{2})/);
	assert.equal(+count, times.length);
	assert.equal(+mm * 60 + +ss, total);
});
