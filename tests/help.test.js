import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");

test("el pie no lleva textos: solo un botón ? que abre la ayuda", () => {
	assert.equal(html.includes('class="hint"'), false);
	assert.equal(html.includes('class="title"'), false);
	assert.match(html, /<button[^>]*popovertarget="help"[^>]*>[\s\S]*?\?[\s\S]*?Controles[\s\S]*?<\/button>/);
	const help = html.match(/<div id="help"[^>]*popover[^>]*>[\s\S]*?<\/div>\s*<button id="help-button"/)?.[0];
	assert.ok(help, "falta la ayuda");
	for (const key of ["P", "N", "B", "M", "T", "R"]) assert.match(help, new RegExp(`<kbd>${key}</kbd>`));
	assert.match(help, /contraportada/i);
});

test("la ayuda se lee por bloques: ratón o dedo y teclado, cada acción con su efecto, y se cierra con su X", () => {
	const help = html.match(/<div id="help"[\s\S]*?<\/div>\s*<button id="help-button"/)?.[0];
	assert.match(help, /<h3[^>]*>Ratón o dedo<\/h3>/);
	assert.match(help, /<h3[^>]*>Teclado<\/h3>/);
	assert.match(help, /popovertarget="help" popovertargetaction="hide"[^>]*aria-label="Cerrar la ayuda"/);
	assert.match(help, /<kbd>Espacio<\/kbd>/);
	for (const row of help.match(/<li>[\s\S]*?<\/li>/g)) assert.match(row, /<span class="help-act">[\s\S]+<\/span><span>[^<]+<\/span>/);
});
