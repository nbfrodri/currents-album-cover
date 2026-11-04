# Album cover 3D — Currents

Portada 3D interactiva inspirada en *Currents* (Tame Impala), hecha con **Three.js** y modelada de forma procedural en **Blender** (vía MCP). Se comporta como una carta holográfica de TCG: al inclinarla cambia de color, brilla y sus capas se separan por parallax.

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
| Mover el ratón / inclinar el móvil | Inclina la portada (efecto carta) |
| Arrastrar | Gira la cámara alrededor de la portada |
| Rueda / pellizcar | Acerca y aleja |
| Clic derecho / dos dedos | Desplaza la vista |
| Botón **Centrar** o tecla `R` | Vuelve a la vista inicial |
| Botón **Sonido** o tecla `S` | Activa/desactiva la banda sonora ambiental |
| Sin interacción 2,5 s | Balanceo automático |

## Técnicas

- **Toda la portada se hace en Blender** (`blender/currents.py`), tomando como referencia la portada original: forma, colores, materiales y texto. La web solo carga el modelo y añade la interacción.
	- **Rayas**: ~100 rayas lila como tubos planos que siguen las *líneas de corriente* de un flujo potencial alrededor de la bola, `ψ = d⊥ · (1 − R² / r²)` (se resuelve `ψ = cte` por bisección). Son rectas hasta la bola; detrás, ondas y ruido las deforman en el plano y en altura. Su color (lila que se oscurece arriba a la derecha) va en los vértices.
	- **Estela**: una sola línea por el hueco central (`ψ ≈ 0`) a ras de las rayas: hilo rojo fino, mancha rosa al llegar a la bola, pasa por debajo y sale como cola ondulada naranja y amarilla.
	- **Bola**: cromo gris satinado (metálico con rugosidad), hundida en un hoyo de la superficie.
	- **Texto**: "TAME IMPALA" y "CURRENTS" en naranja, flotando por delante de la superficie.
	- **Reflejo**: Blender renderiza una panorámica desde el centro de la bola (`public/models/ball_env.jpg`) con las rayas y un cielo de estudio; la web la usa como entorno del cromo y la gira con la portada.
- **Profundidad y parallax**: rayas, ondas, hoyo, bola y texto están a alturas distintas; al inclinar la portada o girar la cámara cada capa se desplaza de forma diferente.
- **Marco como ventana**: el marco es hueco, con grosor y bisel (`ExtrudeGeometry`), y la escena queda dentro, recortada con planos de corte.
- **Cámara libre** (`OrbitControls`): girar, acercar y desplazar, con límites para no ver la portada por detrás.
- **Efecto carta**: el puntero (o el giroscopio) inclina la portada y un brillo especular le sigue.
- **Banda sonora procedural** (`src/audio.js`, Web Audio API, sin archivos de audio): pad de osciladores desafinados, filtro paso bajo modulado y eco. La inclinación controla el corte del filtro y el panorama estéreo.

## Rendimiento y accesibilidad

- Modelo comprimido con **Draco** (~300 KB); decodificador local en `public/draco/`.
- Si los primeros 2 s van por debajo de 45 fps, baja la resolución interna.
- Respeta `prefers-reduced-motion`: sin balanceo automático; también responde a cambios de la preferencia con la página abierta.
- Controles accesibles por teclado (`S`, `R`, foco visible) y con `aria-pressed`; los atajos respetan los modificadores y los campos de texto.
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
src/audio.js          banda sonora ambiental procedural
src/shaders.js        shader de la capa de brillo
```
