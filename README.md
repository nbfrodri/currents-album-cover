# Album cover 3D — Currents

Portada 3D interactiva inspirada en *Currents* (Tame Impala), hecha con **Three.js** y modelada de forma procedural en **Blender** (vía MCP). Se comporta como una carta holográfica de TCG: al inclinarla cambia de color, brilla y sus capas se separan por parallax.

**Demo:** https://nbfrodri.github.io/currents-album-cover/

## Ejecutar

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # versión de producción en dist/
```

Para probarlo en el móvil (misma red Wi‑Fi): `npx vite --host` y abrir la IP que muestra.

## Controles

| Acción | Efecto |
|---|---|
| Inclinar el móvil | Inclina la portada (efecto carta) |
| Arrastrar (clic izquierdo) | Gira la cámara alrededor del álbum, también por detrás (contraportada con el tracklist) |
| Rueda / pellizcar | Acerca y aleja (sin alejarse más que la vista inicial) |
| Tecla `R` | Vuelve a la vista inicial |
| Tecla `T` | Muestra/oculta el reproductor (la X o `Esc` lo recogen al nombre del álbum) |
| Clic en la bola o tecla `P` | Reproduce o pausa el disco |
| Tecla `N` · tecla `B` | Tema siguiente · tema anterior |
| Clic en un tema de la contraportada | Reproduce ese tema |
| Pasar el ratón por la portada | Las rayas ondulan alrededor del puntero |

## Técnicas

- **Toda la portada se hace en Blender** (`blender/currents.py`), tomando como referencia la portada original: forma, colores, materiales y texto. La web solo carga el modelo y añade la interacción.
	- **Rayas**: tubos planos lila trazados como curvas de nivel de un flujo potencial (`blender/flow.py`, marching squares). Detrás de la bola, remolinos locales forman eses, horquillas y gotas dentro de una estela diagonal hacia abajo a la derecha; fuera de ella las rayas permanecen tranquilas. El ancho se adapta a la separación y curvatura. Los colores de vértice incluyen crestas claras, lados oscuros, sombras en los pliegues y el hoyo, y una caída a casi negro arriba a la derecha; no se usan texturas de imagen.
	- **Estela**: una sola línea por el hueco central (`ψ ≈ 0`) a ras de las rayas: hilo rojo fino, mancha rosa al llegar a la bola, pasa por debajo y sale como cola ondulada naranja y amarilla.
	- **Bola**: cromo gris satinado, hundida en un hoyo de la superficie, con rugosidad irregular (manchas suaves en una textura generada en Blender).
	- **Cristal trasero**: una placa gruesa y biselada, con vetas diagonales de reflejo, cubre la contraportada dentro del marco y refleja el entorno. Un filete fino bajo cada fila une cada tema con su duración.
	- **Letras con la música**: los títulos de la portada y los de la contraportada (piezas sueltas en Blender) se encienden con la energía, se apagan en los pasajes tranquilos y laten con cada golpe.
	- **Texto**: "TAME IMPALA" y "CURRENTS" en naranja, flotando por delante de la superficie.
	- **Reflejo**: Blender renderiza una panorámica desde el centro de la bola (`public/models/ball_env.jpg`) con las rayas y un cielo de estudio; la web la usa como entorno del cromo y la gira con la portada.
- **Profundidad y parallax**: rayas, ondas, hoyo, bola y texto están a alturas distintas; al inclinar la portada o girar la cámara cada capa se desplaza de forma diferente.
- **Marco como ventana**: el marco es hueco, con grosor y bisel (`ExtrudeGeometry`), y la escena queda dentro, recortada con planos de corte.
- **Cámara** (`OrbitControls`): girar con el clic izquierdo y acercar; sin desplazamiento con el derecho. Tras 5 s sin tocar nada, la cámara vuelve al frente y la portada se balancea sola (±29°), sin enseñar nunca la parte de atrás.
- **Efecto carta**: el puntero (o el giroscopio) inclina la portada y un brillo especular le sigue.
- **Reproductor** (`src/player.js`, `src/tracks.js`): un `<audio>` que prueba primero `public/audio/NN.mp3` (tu copia del disco, fuera de git) y, si no está, el preview oficial de 30 s de Apple. Un `AnalyserNode` alimenta el visualizador del panel (`src/visualizer.js`, rayas lila que ondulan) y la portada: las crestas de las ondas suben con los graves, la bola late y la línea del medio (hilo, mancha y cola) lleva un gradiente animado que la recorre de principio a fin.
- **HUD** con el estilo de la portada: Archivo Expanded (OFL, en `public/fonts/`), amarillo anaranjado y lila sobre negro, el botón de play como la bola cromada y la barra de progreso con los colores de la estela.
- **Banda sonora procedural** (`src/audio.js`, Web Audio API, sin archivos de audio): pad de osciladores desafinados, filtro paso bajo modulado y eco. La inclinación controla el corte del filtro y el panorama estéreo.

## Rendimiento y accesibilidad

- Modelo comprimido con **Draco** (~300 KB); decodificador local en `public/draco/`.
- Si los primeros 2 s van por debajo de 45 fps, baja la resolución interna.
- Respeta `prefers-reduced-motion`: sin balanceo automático; también responde a cambios de la preferencia con la página abierta.
- Controles accesibles por teclado (`R`, `T`, `P`, `N`, `B`, `M`, foco visible) y con `aria-pressed`; los atajos respetan los modificadores y los campos de texto.
- El giroscopio necesita un navegador compatible y un contexto seguro (HTTPS o localhost). En iOS, toca la página para solicitar permiso; una IP de la red local por HTTP permite probar el puntero, pero no garantiza acceso al sensor.

## Verificación

```bash
npm test
npx vite build
```

## Regenerar el modelo

Con Blender abierto (5.x), en la consola de Python o vía MCP:

```python
CURRENTS_PATH = "/ruta/al/proyecto/blender/currents.py"
exec(open(CURRENTS_PATH).read())
```

Genera la escena, exporta `public/models/currents.glb` y renderiza con Cycles la panorámica `public/models/ball_env.jpg`. Los parámetros (número de líneas, capas, radio de la bola, ángulo…) están al principio del script.

## Estructura

```
blender/currents.py   generador procedural + exportación GLB
public/models/        modelo exportado y panorámica del reflejo
public/draco/         decodificador Draco
src/main.js           escena, interacción y bucle
src/panel.js          panel del reproductor y tracklist
src/player.js         reproductor (MP3 local o preview) y analizador
src/tracks.js         datos del disco
src/visualizer.js     visualizador de rayas
src/waves.js          shaders inyectados: ondas, agua del ratón y estela
src/backdrop.js       fondo de rayas que ondulan con la música
src/beat.js           latido de la bola al ritmo
src/back.js           filas clicables de la contraportada
src/shaders.js        shader de la capa de brillo
```

## Créditos

Proyecto académico de fan art, sin ánimo de lucro. *Currents* (2015) es de Tame Impala; la portada original es obra de Robert Beatty. Aquí no se incluye ningún audio: el reproductor usa los previews oficiales de 30 s de Apple o tus propios archivos en `public/audio/` (fuera de git). Tipografía Archivo Expanded bajo licencia SIL Open Font License (`public/fonts/OFL.txt`).
