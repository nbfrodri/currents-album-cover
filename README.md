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

- **Superficie de rayas** (`src/shaders.js`, `surfaceShader`): ~70 rayas negras y lila calculadas en el shader como *líneas de corriente* de un flujo potencial alrededor de la bola, `ψ = d⊥ · (1 − R² / r²)`. Son rectas y paralelas a la trayectoria hasta llegar a la bola; detrás, una estela en abanico deforma el dominio con ondas que viajan aguas abajo y ruido, como en el original.
- **Canal de la estela**: las rayas se apartan alrededor de `ψ ≈ 0` dejando un hueco por el que pasa la bola: rojo antes de llegar y rosa → naranja → amarillo después, siguiendo las mismas ondas.
- **Modelado en Blender** (`blender/currents.py`): la bola y el tramo recto de la estela como tubo 3D apoyado sobre el canal, con posiciones medidas sobre la portada original y exportados a GLB.
- **Reflejo real de la bola**: una `CubeCamera` captura cada fotograma la portada que rodea a la bola, más un entorno solo visible para el reflejo (suelo de rayas, cielo oscuro y una ventana de luz arriba a la izquierda).
- **Parallax por capas**: superficie, estela, bola y texto están a distintas profundidades; la cámara en perspectiva produce el parallax al girar y el modo *Profundidad* multiplica esas distancias.
- **Efecto holo de carta**: arcoíris sutil sobre las rayas claras y brillo especular que sigue al puntero, ambos dependientes de la inclinación.
- **Banda sonora procedural** (`src/audio.js`, Web Audio API, sin archivos de audio): pad de osciladores desafinados, filtro paso bajo modulado y eco. La inclinación controla el corte del filtro y el panorama estéreo.
- **Marco con grosor** (`ExtrudeGeometry` con bisel) para que se lea como objeto físico.

## Rendimiento y accesibilidad

- Modelo comprimido con **Draco** (~16 KB); decodificador local en `public/draco/`.
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
src/shaders.js        shaders de la superficie, la estela, el reflejo y el brillo
```
