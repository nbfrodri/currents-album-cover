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
| Mover el ratón / inclinar el móvil | Gira la portada |
| Botón **Sonido** o tecla `S` | Activa/desactiva la banda sonora ambiental |
| Sin interacción 2,5 s | Balanceo automático |

## Técnicas

- **Todo el relieve se modela en Blender** (`blender/currents.py`):
	- **Rayas**: ~100 rayas lila como tubos planos que siguen las *líneas de corriente* de un flujo potencial alrededor de la bola, `ψ = d⊥ · (1 − R² / r²)` (se resuelve `ψ = cte` por bisección). Son rectas hasta la bola; detrás, ondas y ruido las deforman en el plano y en altura, como un líquido.
	- **Bola hundida**: la superficie forma un hoyo bajo la bola y las rayas se pegan a ella.
	- **Estela**: un tubo por el hueco central entre rayas (`ψ ≈ 0`): recto hasta la bola y ondulado después, con las mismas ondas.
- **Color en Three.js** (`src/shaders.js`): las rayas toman el lila del original y se oscurecen hacia arriba a la derecha; la estela pasa de rojo a rosa, naranja y amarillo según su distancia a la bola (guardada en la UV).
- **Bola de cromo**: espejo perfecto cuyo reflejo es una `CubeCamera` que captura la propia portada cuando cambia la inclinación, más un entorno de estudio solo visible para el reflejo.
- **Marco como ventana**: el marco es hueco, con grosor y bisel (`ExtrudeGeometry`), y la escena queda detrás, recortada con planos de corte; al girar la portada se ve el volumen real.
- **Efecto holo de carta**: arcoíris sutil sobre las rayas y brillo especular que sigue al puntero, según la inclinación.
- **Banda sonora procedural** (`src/audio.js`, Web Audio API, sin archivos de audio): pad de osciladores desafinados, filtro paso bajo modulado y eco. La inclinación controla el corte del filtro y el panorama estéreo.

## Rendimiento y accesibilidad

- Modelo comprimido con **Draco** (~300 KB); decodificador local en `public/draco/`.
- Si los primeros 2 s van por debajo de 45 fps, baja la resolución interna.
- Respeta `prefers-reduced-motion`: sin balanceo automático; también responde a cambios de la preferencia con la página abierta.
- Controles accesibles por teclado (`S`, foco visible) y con `aria-pressed`; los atajos respetan los modificadores y los campos de texto.
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

Genera la escena y exporta `public/models/currents.glb`. Los parámetros (número de líneas, capas, radio de la bola, ángulo…) están al principio del script.

## Estructura

```
blender/currents.py   generador procedural + exportación GLB
public/models/        modelo exportado
public/draco/         decodificador Draco
src/main.js           escena, interacción y bucle
src/audio.js          banda sonora ambiental procedural
src/shaders.js        shaders de las rayas, la estela, el reflejo y el brillo
```
