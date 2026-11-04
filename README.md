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
| Botón **Profundidad** o tecla `P` | Separa las capas para ver el volumen |
| Botón **Sonido** o tecla `S` | Activa/desactiva la banda sonora ambiental |
| Sin interacción 2,5 s | Balanceo automático |

## Técnicas

- **Líneas de corriente físicas** (`blender/currents.py`): las líneas son la solución del *flujo potencial alrededor de un cilindro*, `ψ = y · (1 − R² / r²)`. Para cada valor de ψ se busca `y(x)` por bisección, se rota el campo en diagonal, se recorta al cuadrado de la portada y se convierte en tubos con `bmesh`.
- **Capas para el parallax**: las líneas se reparten en 4 capas (`Layer_0..3`) a distintas profundidades y la bola queda por delante. La cámara en perspectiva produce el parallax real al girar; el modo *Profundidad* multiplica esas distancias.
- **Shader iridiscente de las líneas** (`src/shaders.js`): el color sale de una rampa cálida (naranja → rojo → magenta) desplazada por el **término de Fresnel**, el ángulo de inclinación y la posición en la línea (UV generadas en Blender). Un pulso animado recorre cada corriente.
- **Lámina holográfica**: degradado de fondo + bandas arcoíris y destellos cuya intensidad depende de la inclinación, como el *foil* de una carta.
- **Brillo especular** que sigue al puntero (plano aditivo) y **bola cromada** con `MeshPhysicalMaterial` (metal + iridiscencia) iluminada por un `RoomEnvironment`.
- **Banda sonora procedural** (`src/audio.js`, Web Audio API, sin archivos de audio): pad de osciladores desafinados con una progresión lenta de acordes, filtro paso bajo modulado y eco con realimentación. La inclinación de la portada controla el corte del filtro (eje vertical) y el panorama estéreo (eje horizontal).
- **Marco con grosor** (`ExtrudeGeometry` con bisel) para que se lea como objeto físico.

## Rendimiento y accesibilidad

- Modelo comprimido con **Draco** (707 KB → 58 KB); decodificador local en `public/draco/`.
- Si los primeros 2 s van por debajo de 45 fps, baja la resolución interna.
- Respeta `prefers-reduced-motion`: sin balanceo automático ni pulsos.
- Controles accesibles por teclado (`P`, foco visible) y con `aria-pressed`.

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
src/shaders.js        shaders de líneas, lámina y brillo
```
