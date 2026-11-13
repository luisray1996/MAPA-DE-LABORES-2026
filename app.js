/* =========================================================
   FUNDO SANTA ROSA — CONTROL DE APLICACIONES, RIEGOS Y CAMPO
========================================================= */

const SVG_NS = "http://www.w3.org/2000/svg";

/* =========================================================
   CONFIGURACIÓN DE CUARTELES — FUNDO SANTA ROSA
   Formato por línea:  CUARTEL  EQUIPO  TURNO
========================================================= */

const TABLA_CUARTELES = `
1 A 1
2 A 1
3 A 1
4 A 1
5 A 2
6 A 2
7 A 2
8 A 2
9 A 3
10 A 3
11 A 3
12 A 3
13 A 4
14 A 4
15 A 4
16 A 4
17 A 5
18 A 5
19 A 5
20 A 5
21 B 1
22 B 1
23 B 1
24 B 1
25 B 2
26 B 2
27 B 2
28 B 3
29 B 3
30 B 3
31 B 4
32 B 4
33 B 4
34 B 4
35 B 5
36 B 5
37 B 5
38 B 5
39 C 1
40 C 1
41 C 1
42 C 1
43 C 2
44 C 2
45 C 2
46 C 2
47 C 3
48 C 3
49 C 3
50 C 3
51 C 4
52 C 4
53 C 4
54 C 4
55 C 5
56 C 5
57 C 5
58 C 5
59 D 1
60 D 1
61 D 1
62 D 1
63 D 2
64 D 2
65 D 2
66 D 2
67 D 3
68 D 3
69 D 3
70 D 3
71 D 5
72 D 5
73 D 4
74 D 4
75 D 4
76 D 4
77 D 5
78 D 5
`;

const cuarteles = {};

TABLA_CUARTELES.trim().split("\n").forEach(linea => {
    const p = linea.trim().split(/\s+/);
    if (p.length < 3) return;
    cuarteles[p[0]] = { equipo: p[1], turno: p[2], subturno: p[2] };
});


/* =========================================================
   REGLAS Y AJUSTES

   APTITUD PARA LABOR DE CAMPO
     0, 2, 4, 6, 8 h (o sin restricción) -> APTO
     12, 24, 48 h                         -> NO APTO
========================================================= */

const HORAS_NO_APTO = 12;

const FONT_MAX_INTERIOR = 3.4;   // máximo dentro de un cuartel
const FONT_MIN_INTERIOR = 2.3;   // menos que esto -> la info va al cuadro "Detalles"
const INTERLINEADO = 1.22;

// Cuadro de riego (uno por turno, dentro del turno)
const FONT_RIEGO_MAX = 2.8;
const FONT_RIEGO_MIN = 1.9;      // menos que esto -> el riego pasa al cuadro Detalles

// Tamaño mínimo del ícono de trabajadores (alto de cada figura, unidades del SVG)
const MIN_ICONO = 3.6;           // menos que esto -> la labor pasa al cuadro Detalles

// false = solo los cuarteles pequeños (donde el texto no entra) van al cuadro Detalles
// true  = TODAS las aplicaciones se listan en el cuadro Detalles
const MOSTRAR_TODAS_EN_PANEL = false;

// Cuarteles cuya info de aplicación va SIEMPRE al cuadro Detalles
const FORZAR_PANEL = {};

// Cuadro Detalles en la imagen descargada (unidades del SVG)
const PANEL_ANCHO_SVG = 105;
const PANEL_MAX_CARACTERES = 36;

// Elementos de la leyenda que se usarán más adelante.
// (Comedores: el plano de Santa Rosa aún no los tiene dibujados.)
const OCULTAR_LEYENDA_PENDIENTE = true;
const LEYENDA_PENDIENTE = ["Ingreso de buses", "Salida de buses", "Paraderos", "Comedores"];


/* =========================================================
   DATOS
========================================================= */

let aplicaciones = {};
let riegos = {};
let labores = {};
const CLAVE_LABORES = "santarosa_labores_v1";
function guardarLaboresLocal() {}
function cargarLaboresLocal() {}

let anchoMapaSVG = 0;
let altoMapaSVG = 0;

let bboxCuarteles = {};        // caja de cada cuartel (en coordenadas del mapa)
let inversas = {};             // matriz inversa del transform de cada cuartel
let etiquetasCuarteles = {};   // caja del número de cada cuartel
let infoInterior = {};         // rect del texto de aplicación dentro del cuartel
let cacheAnchoTexto = {};
let zonasOcupadas = [];        // textos, cuadros e íconos ya colocados en el mapa
let riegoEnMapa = {};          // turnos de riego cuyo cuadro cupo en el mapa
let iconoEnMapa = {};          // labores cuyo ícono cupo dentro del cuartel


/* =========================================================
   COLORES
========================================================= */

const COLORES = {
    restriccionAlta: "#f50808",   // 24 h a más
    restriccionMedia: "#f87171",  // 12 h
    sinRestriccion: "#a7f3a0",    // 8, 6, 4, 2, 0 h
    riego: "#81d4fa",             // riego sin tiempo de reingreso
    disponible: "#ffffff"
};

function colorPorHoras(horas) {
    const h = Number(horas);
    if (h >= 24) return COLORES.restriccionAlta;
    if (h >= 12) return COLORES.restriccionMedia;
    return COLORES.sinRestriccion;
}


/* =========================================================
   UTILIDADES
========================================================= */

function crear(tag, atributos, texto) {
    const e = document.createElementNS(SVG_NS, tag);
    Object.keys(atributos || {}).forEach(k => e.setAttribute(k, atributos[k]));
    if (texto !== undefined) e.textContent = texto;
    return e;
}

function compararIds(a, b) {
    const na = parseInt(a, 10);
    const nb = parseInt(b, 10);
    if (na !== nb) return na - nb;
    return String(a).localeCompare(String(b), undefined, { numeric: true });
}

function areaSolape(a, b) {
    const ancho = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
    const alto = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
    if (ancho <= 0 || alto <= 0) return 0;
    return ancho * alto;
}

// Matriz del atributo transform de un elemento (null si no tiene)
function matrizDe(el) {
    try {
        const c = el.transform && el.transform.baseVal.consolidate();
        return c ? c.matrix : null;
    } catch (e) {
        return null;
    }
}

// Caja de un elemento en las coordenadas del mapa (considera su transform).
// En Santa Rosa los cuarteles son rectángulos girados, por eso es necesario.
function bboxEnRaiz(el) {

    const b = el.getBBox();
    const m = matrizDe(el);
    if (!m) return { x: b.x, y: b.y, width: b.width, height: b.height };

    const puntos = [
        [b.x, b.y], [b.x + b.width, b.y],
        [b.x, b.y + b.height], [b.x + b.width, b.y + b.height]
    ].map(p => ({
        x: m.a * p[0] + m.c * p[1] + m.e,
        y: m.b * p[0] + m.d * p[1] + m.f
    }));

    const xs = puntos.map(p => p.x);
    const ys = puntos.map(p => p.y);

    return {
        x: Math.min(...xs),
        y: Math.min(...ys),
        width: Math.max(...xs) - Math.min(...xs),
        height: Math.max(...ys) - Math.min(...ys)
    };
}

// Ancho real del texto (negrita Arial) por cada unidad de tamaño de letra
function anchoPorUnidad(texto) {

    if (cacheAnchoTexto[texto] !== undefined) return cacheAnchoTexto[texto];

    let valor = texto.length * 0.62;
    const svgEl = document.querySelector("#mapaContainer svg");

    if (svgEl) {
        try {
            const t = crear("text", {
                x: 0, y: 0, opacity: 0,
                "font-size": 10,
                "font-family": "Arial, sans-serif",
                "font-weight": "bold"
            }, texto);
            svgEl.appendChild(t);
            const w = t.getBBox().width;
            svgEl.removeChild(t);
            if (w > 0) valor = w / 10;
        } catch (e) { /* se usa la estimación */ }
    }

    cacheAnchoTexto[texto] = valor;
    return valor;
}

function anchoMaximo(lineas) {
    return Math.max(...lineas.map(l => anchoPorUnidad(l.texto)));
}

// Parte una lista de cuarteles en líneas de ancho limitado
function envolverLista(prefijo, ids, maxCaracteres) {

    const lineas = [];
    let actual = prefijo;
    let vacia = true;

    ids.forEach(id => {

        const pieza = (vacia ? "" : ", ") + id;

        if (!vacia && (actual + pieza).length > maxCaracteres) {
            lineas.push(actual + ",");
            actual = id;
        } else {
            actual += pieza;
        }

        vacia = false;
    });

    lineas.push(actual);
    return lineas;
}


/* =========================================================
   INICIO
========================================================= */

document.addEventListener("DOMContentLoaded", function () {
    // Los datos se cargan desde Supabase después del inicio de sesión.
    colocarFechaActual();
    aplicarVisibilidadLeyenda();
    crearBotonNuevoDia();
    crearBotonHistorial();
    crearBotonGuardarFinal();
    cargarCuarteles();
    inicializarMapa();
});


/* =========================================================
   FECHAS Y HORAS
========================================================= */

function colocarFechaActual() {
    const hoy = new Date();
    const fecha = hoy.toLocaleDateString("es-PE", {
        day: "2-digit", month: "2-digit", year: "numeric"
    });
    document.getElementById("fechaActual").textContent = fecha;
}

// Ejemplo: 12-OCT
function formatearFechaCorta(fecha) {

    if (!fecha) return "";
    const partes = fecha.split("-");
    if (partes.length !== 3) return fecha;

    const meses = ["ENE", "FEB", "MAR", "ABR", "MAY", "JUN",
        "JUL", "AGO", "SEP", "OCT", "NOV", "DIC"];

    return `${partes[2]}-${meses[Number(partes[1]) - 1]}`;
}

// Ejemplo: 10:00 AM
function formatearHora(hora) {

    if (!hora) return "";
    const partes = hora.split(":");

    let horas = Number(partes[0]);
    const minutos = partes[1];
    const periodo = horas >= 12 ? "PM" : "AM";

    if (horas === 0) horas = 12;
    if (horas > 12) horas -= 12;

    return `${horas}:${minutos} ${periodo}`;
}


/* =========================================================
   CARGAR CUARTELES EN LOS SELECT
========================================================= */

function cargarCuarteles() {

    const selectAplicacion = document.getElementById("aplicacionCuartel");
    const selectCampo = document.getElementById("campoCuartel");

    Object.keys(cuarteles)
        .sort(compararIds)
        .forEach(numero => {

            const opcionAplicacion = document.createElement("option");
            opcionAplicacion.value = numero;
            opcionAplicacion.textContent = `Cuartel ${numero}`;
            selectAplicacion.appendChild(opcionAplicacion);

            const opcionCampo = document.createElement("option");
            opcionCampo.value = numero;
            opcionCampo.textContent = `Cuartel ${numero}`;
            selectCampo.appendChild(opcionCampo);

        });

    selectCampo.addEventListener("change", function () {
        mostrarEstadoCampo(this.value);
    });
}


/* =========================================================
   INICIALIZAR MAPA (el SVG ya está incrustado en el HTML)
========================================================= */

function inicializarMapa() {

    const svgEl = document.querySelector("#mapaContainer svg");

    if (!svgEl) {
        document.getElementById("mapaContainer").innerHTML = `
            <div class="error-mapa">
                <h3>⚠️ No se encontró el mapa</h3>
                <p>El SVG no está incrustado en el HTML. Vuelva a generar el archivo.</p>
            </div>
        `;
        return;
    }

    if (svgEl.viewBox && svgEl.viewBox.baseVal && svgEl.viewBox.baseVal.width) {
        anchoMapaSVG = svgEl.viewBox.baseVal.width;
        altoMapaSVG = svgEl.viewBox.baseVal.height;
    } else {
        anchoMapaSVG = svgEl.width.baseVal.value;
        altoMapaSVG = svgEl.height.baseVal.value;
    }

    prepararCuartelesSVG();
}


/* =========================================================
   PREPARAR SVG
========================================================= */

function prepararCuartelesSVG() {

    bboxCuarteles = {};
    inversas = {};

    Object.keys(cuarteles).forEach(numero => {

        const elemento = document.getElementById(numero);

        if (!elemento) {
            console.warn(`No se encontró C${numero} en el SVG`);
            return;
        }

        elemento.classList.add("cuartel-svg");

        elemento.addEventListener("click", function () {
            seleccionarCuartel(numero);
        });

        try {
            bboxCuarteles[numero] = bboxEnRaiz(elemento);

            const m = matrizDe(elemento);
            if (m) inversas[numero] = new DOMMatrix([m.a, m.b, m.c, m.d, m.e, m.f]).inverse();
        } catch (error) {
            console.error(`No se pudo calcular la caja de C${numero}`, error);
        }

    });

    detectarEtiquetas(document.querySelector("#mapaContainer svg"));

    refrescarTodo();
}

// Ubica el número de cada cuartel (para no escribir encima de él)
function detectarEtiquetas(svgEl) {

    etiquetasCuarteles = {};

    svgEl.querySelectorAll("text").forEach(t => {

        const id = t.textContent.trim();
        if (!cuarteles[id] || !bboxCuarteles[id]) return;

        let b;
        try { b = t.getBBox(); } catch (e) { return; }

        let xs = [b.x, b.x + b.width];
        let ys = [b.y, b.y + b.height];

        try {
            const consolidada = t.transform.baseVal.consolidate();
            if (consolidada) {
                const m = consolidada.matrix;
                const puntos = [
                    [b.x, b.y], [b.x + b.width, b.y],
                    [b.x, b.y + b.height], [b.x + b.width, b.y + b.height]
                ].map(p => ({
                    x: m.a * p[0] + m.c * p[1] + m.e,
                    y: m.b * p[0] + m.d * p[1] + m.f
                }));
                xs = puntos.map(p => p.x);
                ys = puntos.map(p => p.y);
            }
        } catch (e) { /* sin transformación */ }

        const rect = {
            x: Math.min(...xs),
            y: Math.min(...ys),
            width: Math.max(...xs) - Math.min(...xs),
            height: Math.max(...ys) - Math.min(...ys)
        };

        // El dueño del número es el cuartel sobre el que realmente está escrito
        let dueno = id;
        const enPunto = cuartelEnPunto(rect.x + rect.width / 2, rect.y + rect.height / 2);
        if (enPunto && cuarteles[enPunto]) dueno = enPunto;

        const caja = bboxCuarteles[dueno];
        const ampliada = {
            x: caja.x - 2, y: caja.y - 2,
            width: caja.width + 4, height: caja.height + 4
        };

        if (areaSolape(rect, ampliada) > 0) {
            etiquetasCuarteles[dueno] = rect;
        }

    });
}


/* =========================================================
   DETECCIÓN DE PUNTOS DENTRO DE CUARTELES
   (x, y en coordenadas del mapa; se pasan al sistema local
   del cuartel si éste tiene transform)
========================================================= */

function puntoEnCuartel(id, x, y) {

    const el = document.getElementById(id);
    if (!el) return false;

    if (typeof el.isPointInFill === "function") {
        try {
            let px = x, py = y;
            const inv = inversas[id];
            if (inv) {
                px = inv.a * x + inv.c * y + inv.e;
                py = inv.b * x + inv.d * y + inv.f;
            }
            return el.isPointInFill(new DOMPoint(px, py));
        } catch (e) { /* se usa la caja */ }
    }

    const b = bboxCuarteles[id];
    return !!b && x >= b.x && x <= b.x + b.width && y >= b.y && y <= b.y + b.height;
}

function cuartelEnPunto(x, y) {

    const ids = Object.keys(bboxCuarteles);

    for (let i = 0; i < ids.length; i++) {
        const b = bboxCuarteles[ids[i]];
        if (x < b.x || x > b.x + b.width || y < b.y || y > b.y + b.height) continue;
        if (puntoEnCuartel(ids[i], x, y)) return ids[i];
    }

    return null;
}

function rectDentroDeCuartel(numero, rect) {

    const m = 0.15;
    const x1 = rect.x + m, x2 = rect.x + rect.width - m;
    const y1 = rect.y + m, y2 = rect.y + rect.height - m;

    const puntos = [
        [x1, y1], [x2, y1], [x1, y2], [x2, y2],
        [(x1 + x2) / 2, y1], [(x1 + x2) / 2, y2],
        [x1, (y1 + y2) / 2], [x2, (y1 + y2) / 2]
    ];

    return puntos.every(p => puntoEnCuartel(numero, p[0], p[1]));
}


/* =========================================================
   REFRESCAR TODO EL MAPA

   Orden: color de fondo -> franjas -> texto de aplicación (solo si
   entra) -> íconos de labor (solo si caben) -> cuadro de riego por
   turno -> cuadro "Detalles" (solo lo que no cupo en el mapa).
========================================================= */

function limpiarSuperposiciones() {
    document.querySelectorAll(
        "#mapaContainer .informacion-cuartel, #mapaContainer .icono-trabajadores, #mapaContainer .franja-orillado"
    ).forEach(e => e.remove());
}

function refrescarTodo() {

    actualizarMapa();
    limpiarSuperposiciones();

    infoInterior = {};
    zonasOcupadas = [];
    riegoEnMapa = {};
    iconoEnMapa = {};

    const ids = Object.keys(cuarteles).sort(compararIds);

    ids.forEach(colocarFranjaOrillado);
    ids.forEach(colocarInfoAplicacion);
    ids.forEach(colocarIconoTrabajadores);

    obtenerGruposRiego().forEach(colocarInfoRiegoGrupo);

    actualizarPanelDetalles();
}


/* =========================================================
   SELECCIONAR CUARTEL
========================================================= */

function seleccionarCuartel(numero) {

    const destino = document.getElementById("estadoSeleccionado");
    if (!destino) return;

    const datos = cuarteles[numero];
    const estado = obtenerEstadoCuartel(numero);

    destino.textContent =
        `C${numero} | Equipo ${datos.equipo} | Turno ${datos.turno} | ${estado.texto}`;
}


/* =========================================================
   ESTADO DEL CUARTEL

   FONDO:
   1) Aplicación normal o dron (color por horas)
   2) Riego (celeste sin reingreso / rojo por horas con reingreso)
   3) Disponible (blanco)
   El ORILLADO no pinta fondo (solo franja roja en el borde),
   pero sí cuenta para saber si el cuartel es apto o no.

   APTITUD:
   12, 24, 48 h -> NO APTO     |     0, 2, 4, 6, 8 h -> APTO
========================================================= */

function obtenerEstadoCuartel(numero) {

    const aplicacion = aplicaciones[numero];
    const riego = riegos[numero];
    const tieneLabor = Boolean(labores[numero]);

    const horasAplicacion = aplicacion ? Number(aplicacion.restriccionHoras || 0) : 0;
    const horasAplicacionFondo =
        aplicacion && aplicacion.tipo !== "orillado" ? horasAplicacion : 0;
    const horasRiego = riego && riego.reingreso ? Number(riego.horasReingreso || 0) : 0;

    const horasFondo = Math.max(horasAplicacionFondo, horasRiego);
    const horasMaximas = Math.max(horasAplicacion, horasRiego);
    const noApto = horasMaximas >= HORAS_NO_APTO;

    let color = COLORES.disponible;

    if (horasFondo > 0) {
        color = colorPorHoras(horasFondo);
    } else if (aplicacion && aplicacion.tipo !== "orillado") {
        color = COLORES.sinRestriccion;
    } else if (riego) {
        color = riego.reingreso ? colorPorHoras(horasRiego) : COLORES.riego;
    }

    const detalles = [];

    if (aplicacion) {
        const tipo = aplicacion.tipo === "dron" ? "APLICACIÓN CON DRON"
            : aplicacion.tipo === "orillado" ? "APLICACIÓN DE ORILLADO" : "APLICACIÓN";
        detalles.push(`${tipo} - ${horasAplicacion > 0 ? `RESTRICCIÓN ${horasAplicacion} H` : "SIN RESTRICCIÓN"}`);
    }

    if (riego) {
        detalles.push(riego.reingreso
            ? `RIEGO - REINGRESO ${horasRiego} H`
            : "RIEGO - SIN TIEMPO DE REINGRESO");
    }

    if (!detalles.length && tieneLabor) detalles.push(`LABOR: ${labores[numero].tipo || "CUARTEL A LABORAR"}`);

    return {
        texto: detalles.length ? detalles.join(" | ") : "DISPONIBLE PARA LABOR",
        color,
        noApto,
        horasMaximas,
        aplicacion,
        riego
    };
}


/* =========================================================
   ACTUALIZAR MAPA (color de fondo)
   En el SVG de Santa Rosa los cuarteles vienen con
   fill-opacity:0, por eso se fuerza la opacidad a 1.
========================================================= */

function actualizarMapa() {

    Object.keys(cuarteles).forEach(numero => {

        const elemento = document.getElementById(numero);
        if (!elemento) return;

        elemento.style.fill = obtenerEstadoCuartel(numero).color;
        elemento.style.fillOpacity = "1";

    });
}


/* =========================================================
   FRANJA DE ORILLADO (siempre roja)
========================================================= */

function colocarFranjaOrillado(numero) {

    const elemento = document.getElementById(numero);
    if (!elemento) return;

    const padre = elemento.parentNode;
    if (!padre) return;

    const aplicacion = aplicaciones[numero];
    if (!aplicacion || aplicacion.tipo !== "orillado") return;

    // Caja local (la franja es un clon con el mismo transform)
    const caja = elemento.getBBox();

    const franja = elemento.cloneNode(false);

    franja.setAttribute("id", `orillado-${numero}`);
    franja.setAttribute("class", "franja-orillado");
    franja.removeAttribute("inkscape:label");
    franja.removeAttribute("sodipodi:nodetypes");
    franja.removeAttribute("onload");

    const grosor = Math.min(caja.width, caja.height) * 0.10;

    franja.style.fill = "none";
    franja.style.stroke = COLORES.restriccionAlta;
    franja.style.strokeWidth = grosor;
    franja.style.strokeOpacity = "1";
    franja.style.pointerEvents = "none";

    padre.appendChild(franja);
}


/* =========================================================
   REGISTRAR / ELIMINAR APLICACIÓN
========================================================= */

function registrarAplicacion() {

    const cuartel = document.getElementById("aplicacionCuartel").value;
    const condicion = document.getElementById("aplicacionCondicion").value;
    const momento = document.getElementById("aplicacionMomento").value;
    const tipo = document.getElementById("aplicacionTipo").value;
    const fecha = document.getElementById("fechaAplicacion").value;

    const mensaje = document.getElementById("mensajeAplicacion");

    if (!cuartel || condicion === "" || !momento || !tipo || !fecha) {
        mensaje.textContent = "⚠️ Complete todos los campos.";
        mensaje.style.background = "#fee2e2";
        return;
    }

    aplicaciones[cuartel] = {
        restriccionHoras: Number(condicion),
        fecha: fecha,
        momento: momento,
        tipo: tipo
    };

    refrescarTodo();

    const nombreTipo =
        tipo === "dron" ? "con dron"
            : tipo === "orillado" ? "de orillado"
                : "normal";

    const apto = Number(condicion) < HORAS_NO_APTO;

    mensaje.textContent =
        `✅ Aplicación ${nombreTipo} registrada para C${cuartel}. ` +
        (apto ? "Apto para labores de campo." : `No apto para labor (${condicion} h).`);

    mensaje.style.background = "#dcfce7";

    seleccionarCuartel(cuartel);
}

function eliminarAplicacion() {

    const cuartel = document.getElementById("aplicacionCuartel").value;
    const mensaje = document.getElementById("mensajeAplicacion");

    if (!cuartel) {
        mensaje.textContent = "⚠️ Seleccione el cuartel que desea corregir.";
        mensaje.style.background = "#fee2e2";
        return;
    }

    if (!aplicaciones[cuartel]) {
        mensaje.textContent = `ℹ️ C${cuartel} no tiene ninguna aplicación registrada.`;
        mensaje.style.background = "#fef9c3";
        return;
    }

    delete aplicaciones[cuartel];

    refrescarTodo();

    mensaje.textContent = `🗑️ Aplicación eliminada de C${cuartel}.`;
    mensaje.style.background = "#e0f2fe";

    seleccionarCuartel(cuartel);
}


/* =========================================================
   TURNOS DE RIEGO
========================================================= */

function actualizarTurnos() {

    const equipo = document.getElementById("riegoEquipo").value;
    const selectTurno = document.getElementById("riegoTurno");

    selectTurno.innerHTML = `<option value="">Seleccione turno</option>`;

    document.getElementById("listaCuartelesTurno").innerHTML =
        "Seleccione equipo y turno";

    if (!equipo) return;

    const subturnos = [
        ...new Set(
            Object.values(cuarteles)
                .filter(c => c.equipo === equipo && c.subturno)
                .map(c => c.subturno)
        )
    ];

    subturnos.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

    subturnos.forEach(subturno => {
        const opcion = document.createElement("option");
        opcion.value = subturno;
        opcion.textContent = `Turno ${subturno}`;
        selectTurno.appendChild(opcion);
    });
}

function cuartelesDelSubturno(equipo, subturno) {

    return Object.keys(cuarteles)
        .filter(numero =>
            cuarteles[numero].equipo === equipo &&
            cuarteles[numero].subturno === subturno
        )
        .sort(compararIds);
}

function mostrarCuartelesTurno() {

    const equipo = document.getElementById("riegoEquipo").value;
    const subturno = document.getElementById("riegoTurno").value;
    const contenedor = document.getElementById("listaCuartelesTurno");

    if (!equipo || !subturno) {
        contenedor.innerHTML = "Seleccione equipo y turno";
        return;
    }

    contenedor.innerHTML = "";

    cuartelesDelSubturno(equipo, subturno).forEach(numero => {
        const chip = document.createElement("span");
        chip.className = "cuartel-chip";
        chip.textContent = `C${numero}`;
        contenedor.appendChild(chip);
    });
}

function actualizarCampoReingreso() {

    const tipo = document.querySelector('input[name="tipoRiego"]:checked');
    const contenedor = document.getElementById("campoHorasReingreso");

    if (!contenedor) return;

    contenedor.style.display =
        tipo && tipo.value === "reingreso" ? "flex" : "none";
}


/* =========================================================
   REGISTRAR / ELIMINAR RIEGO
========================================================= */

function registrarRiego() {

    const equipo = document.getElementById("riegoEquipo").value;
    const subturno = document.getElementById("riegoTurno").value;
    const fecha = document.getElementById("fechaRiego").value;
    const hora = document.getElementById("horaRiego").value;
    const horaFinal = document.getElementById("horaFinalRiego").value;
    const tipo = document.querySelector('input[name="tipoRiego"]:checked');
    const horasReingreso = document.getElementById("riegoHorasReingreso").value;

    const mensaje = document.getElementById("mensajeRiego");

    if (!equipo || !subturno || !fecha || !hora || !tipo) {
        mensaje.textContent = "⚠️ Complete todos los campos.";
        mensaje.style.background = "#fee2e2";
        return;
    }

    const conReingreso = tipo.value === "reingreso";

    if (conReingreso && !horasReingreso) {
        mensaje.textContent = "⚠️ Seleccione las horas de reingreso.";
        mensaje.style.background = "#fee2e2";
        return;
    }

    const lista = cuartelesDelSubturno(equipo, subturno);

    lista.forEach(numero => {
       riegos[numero] = {
       equipo: equipo,
       subturno: subturno,
       fecha: fecha,
       hora: hora,
       horaFinal: horaFinal,
       reingreso: conReingreso,
       horasReingreso: conReingreso
        ? Number(horasReingreso)
        : 0
     };
    });

    refrescarTodo();

    const tipoTexto = conReingreso
        ? `🔴 CON REINGRESO (${horasReingreso} H)`
        : "🔵 SIN TIEMPO DE REINGRESO";

    mensaje.textContent =
        `✅ Riego registrado para ${lista.length} cuarteles (turno ${subturno}). ${tipoTexto}`;

    mensaje.style.background = "#dcfce7";
}

function eliminarRiego() {

    const equipo = document.getElementById("riegoEquipo").value;
    const subturno = document.getElementById("riegoTurno").value;
    const mensaje = document.getElementById("mensajeRiego");

    if (!equipo || !subturno) {
        mensaje.textContent = "⚠️ Seleccione el equipo y turno que desea corregir.";
        mensaje.style.background = "#fee2e2";
        return;
    }

    const lista = cuartelesDelSubturno(equipo, subturno)
        .filter(numero => riegos[numero]);

    if (lista.length === 0) {
        mensaje.textContent = `ℹ️ El turno ${subturno} no tiene riegos registrados.`;
        mensaje.style.background = "#fef9c3";
        return;
    }

    lista.forEach(numero => { delete riegos[numero]; });

    refrescarTodo();

    mensaje.textContent =
        `🗑️ Riego eliminado de ${lista.length} cuarteles (turno ${subturno}).`;

    mensaje.style.background = "#e0f2fe";
}


/* =========================================================
   ESTADO DE CAMPO
========================================================= */

function mostrarEstadoCampo(numero) {

    const contenedor = document.getElementById("estadoCampo");

    if (!numero) {
        contenedor.innerHTML = "Seleccione un cuartel";
        return;
    }

    const estado = obtenerEstadoCuartel(numero);

    if (estado.noApto) {

        contenedor.innerHTML = `
            <div class="campo-no-disponible">❌ NO APTO PARA LABOR</div>
            <p>${estado.texto}</p>
        `;

    } else if (estado.horasMaximas > 0) {

        contenedor.innerHTML = `
            <div class="campo-disponible">✅ APTO PARA LABOR</div>
            <p>${estado.texto}</p>
        `;

    } else {

        contenedor.innerHTML = `
            <div class="campo-disponible">✅ DISPONIBLE PARA LABOR</div>
            <p>El cuartel puede registrarse para labores.</p>
        `;

    }
}


/* =========================================================
   REGISTRAR / ELIMINAR LABOR
========================================================= */


function obtenerNombreLabor() {
    const opcion = document.getElementById("tipoLabor");
    const personalizada = document.getElementById("laborPersonalizada");
    return (opcion.value === "OTRA" ? personalizada.value : opcion.value).trim();
}
function actualizarCampoOtraLabor() {
    const personalizada = document.getElementById("laborPersonalizada");
    personalizada.hidden = document.getElementById("tipoLabor").value !== "OTRA";
}
function modificarLabor() {
    const cuartel = document.getElementById("campoCuartel").value;
    const mensaje = document.getElementById("mensajeCampo");
    if (!cuartel) { mensaje.textContent = "⚠️ Seleccione un cuartel."; return; }
    if (!labores[cuartel]) { mensaje.textContent = "⚠️ Primero registre una labor en este cuartel."; return; }
    const tipo = obtenerNombreLabor();
    if (!tipo) { mensaje.textContent = "⚠️ Indique la nueva labor."; return; }
    const anterior = labores[cuartel];
    if (anterior.tipo === tipo) { mensaje.textContent = "ℹ️ El cuartel ya tiene esa labor."; return; }
    if (!confirm(`¿Cambiar la labor del cuartel ${cuartel} de ${anterior.tipo || "SIN ESPECIFICAR"} a ${tipo}?`)) return;
    const historial = Array.isArray(anterior.historial) ? anterior.historial : [];
    historial.push({ tipo: anterior.tipo || "SIN ESPECIFICAR", fecha: anterior.fecha });
    labores[cuartel] = { ...anterior, tipo, fecha: new Date().toISOString(), historial };
    // Persistencia remota gestionada por el adaptador Supabase.
    refrescarTodo();
    mensaje.textContent = `✅ Cuartel ${cuartel}: labor modificada a ${tipo}.`;
    mensaje.style.background = "#dcfce7";
}

function registrarLabor() {

    const cuartel = document.getElementById("campoCuartel").value;
    const mensaje = document.getElementById("mensajeCampo");

    if (!cuartel) {
        mensaje.textContent = "⚠️ Seleccione un cuartel.";
        mensaje.style.background = "#fee2e2";
        return;
    }

    const estado = obtenerEstadoCuartel(cuartel);

    if (estado.noApto) {
        mensaje.textContent =
            `❌ No se puede registrar C${cuartel}: no apto (${estado.texto}).`;
        mensaje.style.background = "#fee2e2";
        return;
    }

    const tipo = obtenerNombreLabor();
    if (!tipo) { mensaje.textContent = "⚠️ Indique la labor."; return; }
    labores[cuartel] = { registrado: true, tipo, fecha: new Date().toISOString(), historial: [] };
    // Persistencia remota gestionada por el adaptador Supabase.

    refrescarTodo();

    mensaje.textContent = `✅ Labor registrada correctamente en C${cuartel}.`;
    mensaje.style.background = "#dcfce7";
}

function eliminarLabor() {

    const cuartel = document.getElementById("campoCuartel").value;
    const mensaje = document.getElementById("mensajeCampo");

    if (!cuartel) {
        mensaje.textContent = "⚠️ Seleccione el cuartel que desea corregir.";
        mensaje.style.background = "#fee2e2";
        return;
    }

    if (!labores[cuartel]) {
        mensaje.textContent = `ℹ️ C${cuartel} no tiene labor registrada.`;
        mensaje.style.background = "#fef9c3";
        return;
    }

    delete labores[cuartel];
    // Persistencia remota gestionada por el adaptador Supabase.

    refrescarTodo();

    mensaje.textContent = `🗑️ Labor eliminada de C${cuartel}.`;
    mensaje.style.background = "#e0f2fe";
}


/* =========================================================
   COLOR DEL TEXTO (según el fondo del cuartel)
========================================================= */

function obtenerColorTexto(color) {

    if (color === COLORES.restriccionAlta) return "#ffffff";
    if (color === COLORES.restriccionMedia) return "#7f1d1d";
    if (color === COLORES.sinRestriccion) return "#14532d";
    if (color === COLORES.riego) return "#075985";

    return "#222222";
}


/* =========================================================
   INFO DE APLICACIÓN DENTRO DEL CUARTEL

   Línea 1:  Ap. 12-OCT   (normal: Ap. | dron: A.dr. | orillado: A.or)
   Línea 2:  24 H / DÍA

   Solo se escribe si ENTRA dentro del cuartel. Si el cuartel es
   pequeño, no se escribe nada encima: la información queda en el
   cuadro "Detalles" al costado del mapa.
========================================================= */

function lineasAplicacion(aplicacion, color) {

    const tipo = aplicacion.tipo === "dron" ? "A.dr."
        : aplicacion.tipo === "orillado" ? "A.or"
            : "Ap.";

    return [
        { texto: `${tipo} ${formatearFechaCorta(aplicacion.fecha)}`, color: color },
        { texto: `${aplicacion.restriccionHoras} H / ${aplicacion.momento === "dia" ? "DÍA" : "NOCHE"}`, color: color }
    ];
}

function colocarInfoAplicacion(numero) {

    const aplicacion = aplicaciones[numero];
    if (!aplicacion) return;

    if (FORZAR_PANEL[numero]) return;

    const elemento = document.getElementById(numero);
    if (!elemento) return;

    const padre = elemento.parentNode;
    if (!padre) return;

    const caja = bboxCuarteles[numero] || bboxEnRaiz(elemento);
    const estado = obtenerEstadoCuartel(numero);
    const lineas = lineasAplicacion(aplicacion, obtenerColorTexto(estado.color));

    const colocado = ubicarTextoInterior(numero, caja, lineas);
    if (!colocado) return;   // cuartel pequeño -> va al cuadro Detalles

    const grupo = crear("g", {
        id: `info-cuartel-${numero}`,
        class: "informacion-cuartel"
    });

    dibujarTextoInterior(grupo, colocado.rect, colocado.fs, lineas);
    infoInterior[numero] = colocado.rect;
    zonasOcupadas.push(colocado.rect);

    padre.appendChild(grupo);
}

function ubicarTextoInterior(numero, caja, lineas) {

    const n = lineas.length;
    const anchoUnidad = anchoMaximo(lineas);
    const etiqueta = etiquetasCuarteles[numero];
    const pad = 0.3;

    const regiones = [];

    if (etiqueta) {
        const bajoEtiqueta = etiqueta.y + etiqueta.height + pad;
        const derechaEtiqueta = etiqueta.x + etiqueta.width + pad;

        regiones.push({ x: caja.x, y: bajoEtiqueta, w: caja.width, h: caja.y + caja.height - bajoEtiqueta });
        regiones.push({ x: derechaEtiqueta, y: caja.y, w: caja.x + caja.width - derechaEtiqueta, h: caja.height });
        regiones.push({ x: caja.x, y: caja.y, w: etiqueta.x - pad - caja.x, h: caja.height });
        regiones.push({ x: caja.x, y: caja.y, w: caja.width, h: etiqueta.y - pad - caja.y });
    } else {
        regiones.push({ x: caja.x, y: caja.y, w: caja.width, h: caja.height });
    }

    let mejor = null;

    regiones.forEach(r => {

        if (r.w < 3 || r.h < 3) return;

        let fs = Math.min(
            FONT_MAX_INTERIOR,
            r.h * 0.92 / (n * INTERLINEADO),
            r.w * 0.94 / anchoUnidad
        );

        // Los cuarteles están girados: la caja del mapa es algo mayor que
        // el cuartel real, así que se prueban más tamaños hasta que entre.
        for (let i = 0; i < 8 && fs >= FONT_MIN_INTERIOR; i++, fs *= 0.93) {

            const rect = probarTexto(numero, r, fs, n, anchoUnidad);

            if (rect) {
                if (!mejor || fs > mejor.fs) mejor = { rect: rect, fs: fs };
                return;
            }

        }

    });

    return mejor;
}

function probarTexto(numero, r, fs, n, anchoUnidad) {

    const ancho = anchoUnidad * fs;
    const alto = n * fs * INTERLINEADO;

    if (ancho > r.w || alto > r.h) return null;

    const xs = [r.x + (r.w - ancho) / 2, r.x + 0.3, r.x + r.w - ancho - 0.3];
    const ys = [r.y + r.h - alto - 0.2, r.y + (r.h - alto) / 2, r.y + 0.2];

    for (const y of ys) {
        for (const x of xs) {
            const rect = { x: x, y: y, width: ancho, height: alto };
            if (rectDentroDeCuartel(numero, rect)) return rect;
        }
    }

    return null;
}

function dibujarTextoInterior(grupo, rect, fs, lineas) {

    lineas.forEach((linea, i) => {

        const halo = linea.color === "#ffffff" ? "#7f1d1d" : "#ffffff";

        const t = crear("text", {
            x: rect.x + rect.width / 2,
            y: rect.y + fs * 0.9 + i * fs * INTERLINEADO,
            "text-anchor": "middle",
            "font-size": fs,
            "font-family": "Arial, sans-serif",
            "font-weight": "bold",
            fill: linea.color,
            stroke: halo,
            "stroke-width": fs * 0.1,
            "stroke-linejoin": "round",
            "paint-order": "stroke"
        }, linea.texto);

        // Estilos en línea: ganan sobre el CSS y viajan en la imagen descargada
        t.style.stroke = halo;
        t.style.strokeWidth = fs * 0.1;
        t.style.paintOrder = "stroke";

        grupo.appendChild(t);

    });
}


/* =========================================================
   CUADRO "DETALLES" (al costado del mapa)

   Solo lista lo que NO cupo dentro del mapa, con el número de cuartel:
   - Aplicaciones de los cuarteles pequeños
   - Riegos de turnos donde el cuadro no cupo
   - Cuarteles a laborar cuyo ícono no cupo

   El mismo modelo se usa para la pantalla y para la imagen
   descargada.
========================================================= */

function nombreTipoAplicacion(tipo) {
    return tipo === "dron" ? "Con dron" : tipo === "orillado" ? "Orillado" : "Normal";
}


function construirDetalles() {

    const entradas = [];

    // ========================================
    // APLICACIONES REGISTRADAS
    // ========================================
    Object.keys(aplicaciones).sort(compararIds).forEach(id => {

        const a = aplicaciones[id];
        if (!a) return;

        const estado = obtenerEstadoCuartel(id);
        const horas = Number(a.restriccionHoras || 0);

        
entradas.push({
    icono: "🚜",

    titulo: `C${id} · ${nombreTipoAplicacion(a.tipo)}`,

    color: a.tipo === "orillado"
        ? COLORES.restriccionAlta
        : estado.color,

    lineas: [
        `${formatearFechaCorta(a.fecha)} · ${
            a.momento === "dia" ? "DÍA" : "NOCHE"
        } · ${Number(a.restriccionHoras || 0)} H`,

        Number(a.restriccionHoras || 0) >= 12
            ? "🔴 NO APTO"
            : "🟢 APTO"
    ]
});
});

    // ========================================
    // RIEGOS REGISTRADOS
    // ========================================
    const grupos = {};

    Object.keys(riegos).forEach(id => {

        const r = riegos[id];
        if (!r) return;

        const clave = `${r.equipo}-${r.subturno}`;

        if (!grupos[clave]) {
            grupos[clave] = { riego: r, ids: [] };
        }

        grupos[clave].ids.push(id);
    });

   
Object.keys(grupos).sort().forEach(clave => {

    const g = grupos[clave];
    const r = g.riego;

    g.ids.sort(compararIds);

    const fechaInicio = r.fecha || "";
    const horaInicio = r.hora || "";
    const horas = Number(r.horasReingreso || 0);

    let termino = "Sin término calculado";

    if (r.reingreso && fechaInicio && horaInicio) {
        const inicio = new Date(`${fechaInicio}T${horaInicio}:00`);

        if (!isNaN(inicio.getTime())) {
            const fin = new Date(
                inicio.getTime() + horas * 60 * 60 * 1000
            );

            termino = fin.toLocaleString("es-PE", {
                day: "2-digit",
                month: "2-digit",
                year: "numeric",
                hour: "2-digit",
                minute: "2-digit",
                hour12: true
            });
        }
    }

    entradas.push({
        icono: "💧",

        titulo: `Riego · Equipo ${r.equipo} / Turno ${r.subturno}`,

        color: r.reingreso
            ? colorPorHoras(horas)
            : COLORES.riego,

        lineas: [
            `Inicio: ${formatearFechaCorta(fechaInicio)} · ${formatearHora(horaInicio)}`,

            r.reingreso
                ? `Reingreso: ${horas} H`
                : "Sin tiempo de reingreso",

            
`         Hora final: ${
          r.horaFinal
          ? formatearHora(r.horaFinal)
        : "No registrada"
        }`,


            ...envolverLista(
                "Cuarteles: ",
                g.ids,
                PANEL_MAX_CARACTERES
            )
        ]
    });
});


    // ========================================
    // LABORES REGISTRADAS
    // ========================================
    Object.keys(labores).sort(compararIds).forEach(id => {

        const labor = labores[id];
        if (!labor) return;

        const fecha = labor.fecha
            ? String(labor.fecha).slice(0, 10)
            : "";

        entradas.push({
            icono: "👷",
            titulo: `Cuartel ${id} — Labor`,
            color: "#ffe066",
            lineas: [
                `Labor: ${labor.tipo || "Sin especificar"}`,
                fecha
                    ? `Fecha: ${formatearFechaCorta(fecha)}`
                    : "Sin fecha"
            ]
        });
    });

    return entradas;
}


function actualizarPanelDetalles() {

    const lista = document.getElementById("panelDetallesLista");
    if (!lista) return;

    const entradas = construirDetalles();

    lista.innerHTML = "";

    if (!entradas.length) {
        const vacio = document.createElement("p");
        vacio.className = "panel-vacio";
        vacio.textContent = "Sin registros por detallar.";
        lista.appendChild(vacio);
        return;
    }

    entradas.forEach(e => {

        const item = document.createElement("div");
        item.className = "detalle-item";
        item.style.borderLeftColor = e.color === "#ffffff" ? "#9ca3af" : e.color;

        const titulo = document.createElement("div");
        titulo.className = "detalle-titulo";
        titulo.textContent = `${e.icono} ${e.titulo}`;
        item.appendChild(titulo);

        e.lineas.forEach(l => {
            const p = document.createElement("div");
            p.className = "detalle-linea";
            p.textContent = l;
            item.appendChild(p);
        });

        lista.appendChild(item);
    });
}


/* =========================================================
   INFO DE RIEGO — UNA SOLA CAJA POR TURNO, DENTRO DEL TURNO

   Línea 1:  R / 19-OCT            (riego sin reingreso)
             R.R 24 H / 19-OCT     (riego con reingreso)
   Línea 2:  H.I 11:00 AM
   Línea 3:  C: 1-2-4-5            (cuarteles a regar)

   Todo el turno se pinta; la información se escribe UNA sola vez,
   dentro de los cuarteles del turno, en un sitio libre: sin tapar
   aplicaciones, íconos de labor ni números de cuartel. Si hace falta
   se reduce la letra. Solo si no cabe se lista en "Detalles".
========================================================= */

function obtenerGruposRiego() {

    const grupos = {};

    Object.keys(riegos).forEach(numero => {

        const r = riegos[numero];
        const clave = `${r.equipo}-${r.subturno}`;

        if (!grupos[clave]) {
            grupos[clave] = { clave: clave, riego: r, cuarteles: [] };
        }

        grupos[clave].cuarteles.push(numero);

    });

    return Object.keys(grupos).map(k => {
        grupos[k].cuarteles.sort(compararIds);
        return grupos[k];
    });
}

// "C: 1-2-4-5" (si es largo, se parte en más líneas)
function envolverCuarteles(ids, maxCaracteres) {

    const lineas = [];
    let actual = "C: ";
    let primero = true;

    ids.forEach(id => {

        const pieza = (primero ? "" : "-") + id;

        if ((actual + pieza).length > maxCaracteres && !primero && actual.trim() !== "C:") {
            lineas.push(actual + "-");
            actual = id;
        } else {
            actual += pieza;
        }

        primero = false;

    });

    lineas.push(actual);
    return lineas;
}

// ¿El rectángulo queda completamente dentro de los cuarteles del turno?
function rectDentroDeCuartelesDe(ids, rect) {

    const m = 0.15;
    const x1 = rect.x + m, x2 = rect.x + rect.width - m;
    const y1 = rect.y + m, y2 = rect.y + rect.height - m;
    const nx = Math.max(2, Math.ceil((x2 - x1) / 2));
    const ny = Math.max(2, Math.ceil((y2 - y1) / 2));

    for (let i = 0; i <= nx; i++) {
        for (let j = 0; j <= ny; j++) {
            const x = x1 + (x2 - x1) * i / nx;
            const y = y1 + (y2 - y1) * j / ny;
            if (!ids.some(id => puntoEnCuartel(id, x, y))) return false;
        }
    }

    return true;
}

function colocarInfoRiegoGrupo(g) {

    const ids = g.cuarteles.filter(id => bboxCuarteles[id]);
    if (!ids.length) return;

    const primero = document.getElementById(ids[0]);
    if (!primero || !primero.parentNode) return;

    const r = g.riego;
    const fecha = formatearFechaCorta(r.fecha);

    const linea1 = r.reingreso ? `R.R ${r.horasReingreso} H / ${fecha}` : `R / ${fecha}`;
    const linea2 = `H.I ${formatearHora(r.hora)}`;

    // Primero la lista en una línea (3 líneas en total); si no cabe, partida en más
    const variantes = [];
    [99, 16, 10].forEach(m => {
        const l = envolverCuarteles(ids, m);
        const k = l.join("|");
        if (!variantes.some(v => v.k === k)) variantes.push({ k: k, textos: [linea1, linea2].concat(l) });
    });

    const colorBorde = r.reingreso ? "#b91c1c" : "#0369a1";
    const padX = 1.0;
    const padY = 0.8;
    const etiquetas = Object.values(etiquetasCuarteles).map(e => ({
        x: e.x - 0.4, y: e.y - 0.4, width: e.width + 0.8, height: e.height + 0.8
    }));

    const union = ids.map(id => bboxCuarteles[id]);
    const x0 = Math.min(...union.map(b => b.x));
    const y0 = Math.min(...union.map(b => b.y));
    const x1 = Math.max(...union.map(b => b.x + b.width));
    const y1 = Math.max(...union.map(b => b.y + b.height));

    let mejor = null;

    for (let fs = FONT_RIEGO_MAX; fs >= FONT_RIEGO_MIN - 0.001 && !mejor; fs -= 0.2) {

        const lh = fs * INTERLINEADO;

        for (const v of variantes) {

            if (mejor) break;

            const w = anchoMaximo(v.textos.map(t => ({ texto: t }))) * fs + padX * 2;
            const h = v.textos.length * lh + padY * 2 - (lh - fs) * 0.5;

            let mejorPuntaje = Infinity;

            for (let y = y0; y + h <= y1; y += 0.8) {
                for (let x = x0; x + w <= x1; x += 0.8) {

                    const rect = { x: x, y: y, width: w, height: h };
                    const cx = x + w / 2, cy = y + h / 2;

                    // dueño = cuartel del turno donde cae el centro
                    const dueno = ids.find(id => puntoEnCuartel(id, cx, cy));
                    if (!dueno) continue;

                    const margen = {
                        x: x - 0.5, y: y - 0.5, width: w + 1, height: h + 1
                    };

                    if (zonasOcupadas.some(z => areaSolape(margen, z) > 0)) continue;
                    if (etiquetas.some(e => areaSolape(rect, e) > 0)) continue;
                    if (!rectDentroDeCuartelesDe(ids, rect)) continue;

                    const b = bboxCuarteles[dueno];
                    const area = b.width * b.height;
                    const dist = Math.hypot(cx - (b.x + b.width / 2), cy - (b.y + b.height / 2));
                    const puntaje = -area * 100 + dist;

                    if (puntaje < mejorPuntaje) {
                        mejorPuntaje = puntaje;
                        mejor = { rect: rect, fs: fs, textos: v.textos };
                    }
                }
            }
        }
    }

    if (!mejor) return;   // no cabe -> se lista en el cuadro Detalles

    const fs = mejor.fs;
    const lh = fs * INTERLINEADO;
    const rect = mejor.rect;

    const grupo = crear("g", {
        id: `info-riego-${g.clave}`,
        class: "informacion-cuartel info-riego-turno"
    });

    grupo.appendChild(crear("rect", {
        x: rect.x, y: rect.y, width: rect.width, height: rect.height,
        rx: 0.6, fill: "#ffffff", "fill-opacity": 0.96,
        stroke: colorBorde, "stroke-width": 0.35
    }));

    mejor.textos.forEach((texto, i) => {

        const t = crear("text", {
            x: rect.x + padX,
            y: rect.y + padY + fs * 0.85 + i * lh,
            "font-size": fs,
            "font-family": "Arial, sans-serif",
            "font-weight": "bold",
            fill: i === 0 ? colorBorde : "#111827"
        }, texto);

        t.style.stroke = "none";
        grupo.appendChild(t);

    });

    primero.parentNode.appendChild(grupo);

    zonasOcupadas.push(rect);
    riegoEnMapa[g.clave] = true;
}


/* =========================================================
   ÍCONO TRABAJADORES

   Sin información en el cuartel: centrado y grande.
   Con texto de aplicación dentro: se coloca en el espacio
   libre más grande que deje el texto.
========================================================= */

function colocarIconoTrabajadores(numero) {

    const elemento = document.getElementById(numero);

    if (!elemento) {
        console.warn(`No existe C${numero} en SVG`);
        return;
    }

    if (!labores[numero]) return;

    const padre = elemento.parentNode;
    const caja = bboxCuarteles[numero] || bboxEnRaiz(elemento);
    const lado = Math.min(caja.width, caja.height);

    const obstaculos = [etiquetasCuarteles[numero], infoInterior[numero]]
        .filter(Boolean)
        .map(o => ({ x: o.x - 0.4, y: o.y - 0.4, width: o.width + 0.8, height: o.height + 0.8 }));

    const cx0 = caja.x + caja.width / 2;
    const cy0 = caja.y + caja.height / 2;

    // Se prueba de más grande a más pequeño hasta que el ícono quepa
    let mejor = null;

    for (let t = lado * 0.55; t >= MIN_ICONO && !mejor; t *= 0.92) {

        const w = 1.56 * t;
        const h = 0.72 * t;
        let mejorDist = Infinity;

        for (let y = caja.y; y + h <= caja.y + caja.height; y += 0.7) {
            for (let x = caja.x; x + w <= caja.x + caja.width; x += 0.7) {

                const rect = { x: x, y: y, width: w, height: h };

                if (obstaculos.some(o => areaSolape(rect, o) > 0)) continue;
                if (!rectDentroDeCuartel(numero, rect)) continue;

                const d = Math.hypot(x + w / 2 - cx0, y + h / 2 - cy0);
                if (d < mejorDist) { mejorDist = d; mejor = { rect: rect, t: t }; }
            }
        }
    }

    if (!mejor) return;   // no cabe -> se lista en el cuadro Detalles

    const tamano = mejor.t;
    const centroX = mejor.rect.x + mejor.rect.width / 2;
    const centroY = mejor.rect.y + tamano * 0.42;

    const grupo = crear("g", {
        id: `trabajadores-${numero}`,
        class: "icono-trabajadores",
        transform: `translate(${centroX}, ${centroY})`
    });

    grupo.appendChild(crearTrabajadorSVG(-tamano * 0.45, 0, tamano * 0.9));
    grupo.appendChild(crearTrabajadorSVG(0, -tamano * 0.08, tamano));
    grupo.appendChild(crearTrabajadorSVG(tamano * 0.45, 0, tamano * 0.9));

    padre.appendChild(grupo);

    iconoEnMapa[numero] = true;
    zonasOcupadas.push(mejor.rect);
}

function crearTrabajadorSVG(x, y, tamano) {

    const grupo = crear("g", {
        transform: `translate(${x}, ${y}) scale(${tamano / 100})`
    });

    grupo.appendChild(crear("circle", { cx: 0, cy: -23, r: 10, fill: "#263238" }));

    grupo.appendChild(crear("path", {
        d: "M -22 8 Q -20 -10 0 -12 Q 20 -10 22 8 L 18 35 L -18 35 Z",
        fill: "#263238"
    }));

    ["-1", "1"].forEach(signo => {
        const s = Number(signo);
        grupo.appendChild(crear("line", {
            x1: 18 * s, y1: 0, x2: 32 * s, y2: 18,
            stroke: "#263238", "stroke-width": 8, "stroke-linecap": "round"
        }));
    });

    return grupo;
}


/* =========================================================
   LEYENDA: ELEMENTOS PENDIENTES (deshabilitados, no borrados)
========================================================= */

function aplicarVisibilidadLeyenda() {

    document.querySelectorAll(".leyenda > span").forEach(item => {

        const texto = item.textContent.trim();
        const pendiente = LEYENDA_PENDIENTE.some(t => texto.indexOf(t) !== -1);

        if (!pendiente) return;

        item.dataset.oculto = OCULTAR_LEYENDA_PENDIENTE ? "1" : "0";
        item.style.display = OCULTAR_LEYENDA_PENDIENTE ? "none" : "";

    });
}


/* =========================================================
   BOTÓN: ACTUALIZAR MAPA (NUEVO DÍA)
========================================================= */


function crearBotonNuevoDia() {

    const descargar = document.getElementById("btnDescargarMapa");

    if (!descargar) {
        console.error("No se encontró el botón Descargar mapa");
        return;
    }

    let boton = document.getElementById("btnNuevoDia");

    if (!boton) {

        boton = document.createElement("button");
        boton.id = "btnNuevoDia";
        boton.type = "button";
        boton.className = "btn-descargar";
        boton.textContent = "🔄 Actualizar mapa";
        boton.style.background = "#c98500";

        const caja = document.createElement("div");
        caja.style.display = "flex";
        caja.style.gap = "8px";
        caja.style.flexWrap = "wrap";

        descargar.parentNode.insertBefore(caja, descargar);

        caja.appendChild(boton);
        caja.appendChild(descargar);
    }

    // Conectar el botón a la limpieza visual
    boton.onclick = function(evento) {

        evento.preventDefault();

        reiniciarMapa();
    };
}

function crearBotonHistorial() {

    const descargar = document.getElementById("btnDescargarMapa");

    if (!descargar || document.getElementById("btnHistorialMapa")) {
        return;
    }

    const boton = document.createElement("button");

    boton.id = "btnHistorialMapa";
    boton.type = "button";
    boton.className = "btn-descargar";
    boton.textContent = "📅 Historial de mapas";
    boton.style.background = "#315c9e";

    boton.addEventListener("click", function() {
        const panel = document.getElementById("panelHistorialMapa");

        if (panel) {
            panel.hidden = !panel.hidden;
        }
    });

    const panel = document.createElement("div");
    panel.id = "panelHistorialMapa";
    panel.hidden = true;
    panel.style.padding = "15px";
    panel.style.background = "#ffffff";
    panel.style.border = "1px solid #cccccc";
    panel.style.borderRadius = "8px";
    panel.style.marginTop = "10px";

    panel.innerHTML = `
        <h3>📅 Historial de mapas</h3>
        <label for="fechaHistorialMapa">Seleccionar fecha:</label>
        <input type="date" id="fechaHistorialMapa">
        <button type="button" id="btnConsultarHistorial">
            🔍 Consultar
        </button>
        <button type="button" id="btnDescargarHistorial">
            ⬇️ Descargar mapa
        </button>
        <p id="mensajeHistorialMapa">
            Selecciona una fecha para consultar su programación.
        </p>
    `;

    const contenedor = descargar.parentElement;
    contenedor.appendChild(boton);
    contenedor.insertAdjacentElement("afterend", panel);

    const selector = document.createElement("select");
    selector.id = "versionHistorialMapa";
    selector.style.margin = "8px";
    selector.innerHTML = '<option value="">Primero consulta una fecha</option>';
    document.getElementById("btnConsultarHistorial").insertAdjacentElement("afterend", selector);

    const volver = document.createElement("button");
    volver.type = "button";
    volver.textContent = "↩ Volver al mapa actual";
    volver.addEventListener("click", volverMapaActual);
    document.getElementById("btnDescargarHistorial").insertAdjacentElement("afterend", volver);

    document.getElementById("btnConsultarHistorial").addEventListener("click", consultarHistorialMapa);
    document.getElementById("btnDescargarHistorial").addEventListener("click", descargarHistorialMapa);
    selector.addEventListener("change", mostrarVersionHistorial);

}


/* Guardado final y consulta de versiones históricas (sin tocar registros_cuartel). */
let fechaVistaHistorica = null;
let versionesHistorial = [];
let datosVigentes = { aplicaciones: {}, riegos: {}, labores: {} };
const copiarDatosMapa = () => JSON.parse(JSON.stringify({ aplicaciones, riegos, labores }));
const fechaLocalMapa = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
};
function pintarDatosMapa(datos) {
    aplicaciones = JSON.parse(JSON.stringify(datos.aplicaciones || {}));
    riegos = JSON.parse(JSON.stringify(datos.riegos || {}));
    labores = JSON.parse(JSON.stringify(datos.labores || {}));
    refrescarTodo();
}
function crearBotonGuardarFinal() {
    const descargar = document.getElementById("btnDescargarMapa");
    if (!descargar || document.getElementById("btnGuardarMapaFinal")) return;
    const boton = document.createElement("button");
    boton.type = "button";
    boton.id = "btnGuardarMapaFinal";
    boton.className = "btn-descargar";
    boton.style.background = "#7253b8";
    boton.textContent = "💾 Guardar mapa final";
    descargar.insertAdjacentElement("afterend", boton);
    boton.addEventListener("click", async () => {
        if (!window.santaDB?.listo) return alert("Inicia sesión en Supabase primero.");
        if (fechaVistaHistorica) return alert("Primero vuelve al mapa actual.");
        const fecha = prompt("Fecha del mapa final (AAAA-MM-DD):", fechaLocalMapa());
        if (fecha === null) return;
        if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha) || Number.isNaN(new Date(fecha+"T12:00:00").getTime())) {
            return alert("Fecha no válida. Usa AAAA-MM-DD.");
        }
        if (!confirm(`¿Guardar una copia FINAL del mapa del ${fecha}? No se cambiarán los registros actuales.`)) return;
        boton.disabled = true;
        try {
            await window.santaDB.guardarMapaFinal(fecha, copiarDatosMapa());
            alert("✅ Mapa final guardado en Supabase. Puedes consultarlo en Historial.");
        } catch (error) {
            console.error(error);
            alert("No se pudo guardar el mapa: " + error.message);
        } finally { boton.disabled = false; }
    });
}
async function consultarHistorialMapa() {
    const fecha = document.getElementById("fechaHistorialMapa").value;
    const mensaje = document.getElementById("mensajeHistorialMapa");
    const selector = document.getElementById("versionHistorialMapa");
    if (!fecha) return alert("Selecciona una fecha.");
    if (!window.santaDB?.listo) return alert("Inicia sesión primero.");
    try {
        versionesHistorial = await window.santaDB.consultarMapas(fecha);
        selector.replaceChildren();
        if (!versionesHistorial.length) {
            selector.add(new Option("No hay mapas guardados", ""));
            mensaje.textContent = "No hay mapas finales guardados para esta fecha.";
            return;
        }
        versionesHistorial.forEach((v, i) => selector.add(new Option(`Versión ${versionesHistorial.length-i} — ${new Date(v.guardado_en).toLocaleString("es-PE")}`, String(i))));
        selector.value = "0";
        mostrarVersionHistorial();
        mensaje.textContent = `Se encontraron ${versionesHistorial.length} versiones. Estás viendo una copia histórica (solo lectura).`;
    } catch (error) { console.error(error); mensaje.textContent = "Error: " + error.message; }
}
function mostrarVersionHistorial() {
    const indice = document.getElementById("versionHistorialMapa").value;
    if (indice === "" || !versionesHistorial[Number(indice)]) return;
    const version = versionesHistorial[Number(indice)];
    fechaVistaHistorica = version.fecha;
    pintarDatosMapa(version);
    const partes = version.fecha.split("-");
    document.getElementById("fechaActual").textContent = `${partes[2]}/${partes[1]}/${partes[0]}`;
}
function volverMapaActual() {
    fechaVistaHistorica = null;
    pintarDatosMapa(datosVigentes);
    colocarFechaActual();
    const mensaje = document.getElementById("mensajeHistorialMapa");
    if (mensaje) mensaje.textContent = "Regresaste al mapa actual compartido.";
}
function descargarHistorialMapa() {
    if (!fechaVistaHistorica) return alert("Primero consulta y selecciona un mapa histórico.");
    descargarMapaComoImagen();
}

// AGREGADO PARA ACTULIZAR MAPA
function limpiarProgramacionActual() {

    aplicaciones = {};
    riegos = {};
    labores = {};

    // Limpiar mapa y detalles
    refrescarTodo();

    // Limpiar formularios
    [
        "aplicacionCuartel",
        "aplicacionTipo",
        "aplicacionCondicion",
        "aplicacionMomento",
        "riegoEquipo",
        "riegoTurno",
        "riegoHorasReingreso",
        "campoCuartel",
        "tipoLabor",
        "horaRiego",
        "horaFinalRiego"
    ].forEach(id => {
        const campo = document.getElementById(id);
        if (campo) campo.value = "";
    });

    document.querySelectorAll(
        'input[name="tipoRiego"]'
    ).forEach(radio => {
        radio.checked = false;
    });

    // Limpiar mensajes
    [
        "mensajeAplicacion",
        "mensajeRiego",
        "mensajeCampo"
    ].forEach(id => {
        const elemento = document.getElementById(id);
        if (elemento) {
            elemento.textContent = "";
            elemento.style.background = "";
        }
    });

    // Actualizar fecha
    colocarFechaActual();

    const hoy = new Date();
    const fechaISO =
        hoy.getFullYear() + "-" +
        String(hoy.getMonth() + 1).padStart(2, "0") + "-" +
        String(hoy.getDate()).padStart(2, "0");

    ["fechaAplicacion", "fechaRiego"].forEach(id => {
        const campo = document.getElementById(id);
        if (campo) campo.value = fechaISO;
    });

    const seleccionado =
        document.getElementById("estadoSeleccionado");

    if (seleccionado) seleccionado.textContent = "";

    const listaTurno =
        document.getElementById("listaCuartelesTurno");

    if (listaTurno) {
        listaTurno.textContent = "Seleccione equipo y turno";
    }

    if (typeof actualizarCampoReingreso === "function") {
        actualizarCampoReingreso();
    }
}

// NUEVO
function reiniciarMapa() {

    const confirmar = confirm(
        "¿Deseas limpiar el mapa y todos los detalles de la programación actual?"
    );

    if (!confirmar) return;

    try {
        // Vaciar registros actuales
        aplicaciones = {};
        riegos = {};
        labores = {};

        // Restablecer mapa y panel
        refrescarTodo();

        // Limpiar campos del formulario
        [
            "aplicacionCuartel",
            "aplicacionTipo",
            "aplicacionCondicion",
            "aplicacionMomento",
            "riegoEquipo",
            "riegoTurno",
            "riegoHorasReingreso",
            "horaRiego",
            "horaFinalRiego",
            "campoCuartel",
            "tipoLabor"
        ].forEach(id => {
            const campo = document.getElementById(id);
            if (campo) campo.value = "";
        });

        document.querySelectorAll(
            'input[name="tipoRiego"]'
        ).forEach(radio => {
            radio.checked = false;
        });

        // Limpiar mensajes
        [
            "mensajeAplicacion",
            "mensajeRiego",
            "mensajeCampo"
        ].forEach(id => {
            const campo = document.getElementById(id);
            if (campo) {
                campo.textContent = "";
                campo.style.background = "";
            }
        });

        // Limpiar selección
        const seleccionado =
            document.getElementById("estadoSeleccionado");

        if (seleccionado) {
            seleccionado.textContent = "";
        }

        // Restablecer lista de cuarteles
        const lista =
            document.getElementById("listaCuartelesTurno");

        if (lista) {
            lista.textContent = "Seleccione equipo y turno";
        }

        // Actualizar fecha
        colocarFechaActual();

        alert("✅ Mapa y Detalles limpiados en pantalla.");

    } catch (error) {
        console.error("Error al limpiar el mapa:", error);
        alert("❌ No se pudo limpiar el mapa: " + error.message);
    }
}




/* =========================================================
   CAMBIAR SECCIÓN
========================================================= */

function mostrarSeccion(nombre, boton) {

    document.querySelectorAll(".seccion").forEach(s => s.classList.remove("activa"));
    document.querySelectorAll(".menu-btn").forEach(b => b.classList.remove("activo"));

    if (nombre === "aplicaciones") document.getElementById("seccionAplicaciones").classList.add("activa");
    if (nombre === "riegos") document.getElementById("seccionRiegos").classList.add("activa");
    if (nombre === "campo") document.getElementById("seccionCampo").classList.add("activa");

    boton.classList.add("activo");
}


/* =========================================================
   DESCARGAR MAPA COMPLETO COMO PNG

   Incluye título, fecha, el mapa a la izquierda, el cuadro
   "Detalles" a la derecha y la leyenda abajo en dos columnas.
========================================================= */

// Dibuja el cuadro Detalles dentro de la imagen. Devuelve la altura usada.
function dibujarPanelEnSVG(svgFinal, x, y, ancho, altoMinimo) {

    const entradas = construirDetalles();

    const fsTitulo = 3.7;
    const fsLinea = 3.2;
    const lhT = fsTitulo * 1.35;
    const lhL = fsLinea * 1.3;
    const pad = 3;

    // Altura necesaria
    let alto = pad + 6 + 4;

    if (!entradas.length) {
        alto += lhL + 2;
    } else {
        entradas.forEach(e => { alto += lhT + e.lineas.length * lhL + 4; });
    }

    alto = Math.max(alto + pad, altoMinimo);

    svgFinal.appendChild(crear("rect", {
        x: x, y: y, width: ancho, height: alto, rx: 1.2,
        fill: "#ffffff", stroke: "#374151", "stroke-width": 0.5
    }));

    svgFinal.appendChild(crear("text", {
        x: x + pad, y: y + pad + 4.2,
        "font-family": "Arial, sans-serif", "font-size": 5, "font-weight": "bold",
        fill: "#374151"
    }, "DETALLES"));

    svgFinal.appendChild(crear("line", {
        x1: x + pad, y1: y + pad + 7, x2: x + ancho - pad, y2: y + pad + 7,
        stroke: "#d1d5db", "stroke-width": 0.3
    }));

    let cy = y + pad + 10;

    if (!entradas.length) {
        svgFinal.appendChild(crear("text", {
            x: x + pad, y: cy + fsLinea,
            "font-family": "Arial, sans-serif", "font-size": fsLinea, fill: "#6b7280"
        }, "Sin registros por detallar."));
        return alto;
    }

    entradas.forEach(e => {

        const altoEntrada = lhT + e.lineas.length * lhL + 1;

        svgFinal.appendChild(crear("rect", {
            x: x + pad, y: cy, width: 1.4, height: altoEntrada,
            fill: e.color === "#ffffff" ? "#9ca3af" : e.color
        }));

        svgFinal.appendChild(crear("text", {
            x: x + pad + 3.2, y: cy + fsTitulo,
            "font-family": "Arial, sans-serif", "font-size": fsTitulo,
            "font-weight": "bold", fill: "#111827"
        }, e.titulo));

        e.lineas.forEach((l, i) => {
            svgFinal.appendChild(crear("text", {
                x: x + pad + 3.2, y: cy + lhT + fsLinea + i * lhL - 0.6,
                "font-family": "Arial, sans-serif", "font-size": fsLinea, fill: "#374151"
            }, l));
        });

        cy += altoEntrada + 3;
    });

    return alto;
}

function descargarMapaComoImagen() {

    const boton = document.getElementById("btnDescargarMapa");
    const svgOriginal = document.querySelector("#mapaContainer svg");

    if (!svgOriginal || !anchoMapaSVG || !altoMapaSVG) {
        alert("El mapa todavía no está listo para descargar.");
        return;
    }

    const restaurarBoton = function () {
        if (boton) {
            boton.disabled = false;
            boton.textContent = "📥 Descargar mapa";
        }
    };

    if (boton) {
        boton.disabled = true;
        boton.textContent = "⏳ Generando imagen...";
    }

    try {

        const anchoTotal = anchoMapaSVG + PANEL_ANCHO_SVG + 6;
        const escala = anchoTotal / 450;
        const altoTitulo = 30 * escala;
        const gap = 3;

        const items = leerLeyendaDelDOM();
        const columnas = 2;
        const filas = Math.ceil(items.length / columnas);
        const altoFila = 9 * escala;
        const altoLeyenda = filas * altoFila + 23 * escala;

        // Se arma primero el panel en un SVG temporal para conocer su altura
        const temporal = crear("svg", {});
        const altoPanel = dibujarPanelEnSVG(temporal, 0, 0, PANEL_ANCHO_SVG, altoMapaSVG);
        const altoCuerpo = Math.max(altoMapaSVG, altoPanel);

        const altoTotal = altoTitulo + altoCuerpo + altoLeyenda;

        const svgFinal = crear("svg", {
            xmlns: SVG_NS,
            width: anchoTotal,
            height: altoTotal,
            viewBox: `0 0 ${anchoTotal} ${altoTotal}`
        });

        svgFinal.appendChild(crear("rect", {
            x: 0, y: 0, width: anchoTotal, height: altoTotal, fill: "#ffffff"
        }));

        // Título
        svgFinal.appendChild(crear("text", {
            x: anchoTotal / 2, y: altoTitulo * 0.48,
            "text-anchor": "middle",
            "font-family": "Arial, sans-serif",
            "font-size": 10 * escala,
            "font-weight": "bold",
            fill: "#8a5a00"
        }, "FUNDO SANTA ROSA"));

        const elementoFecha = document.getElementById("fechaActual");
        const fechaTexto = elementoFecha ? elementoFecha.textContent : "";

        svgFinal.appendChild(crear("text", {
            x: anchoTotal / 2, y: altoTitulo * 0.82,
            "text-anchor": "middle",
            "font-family": "Arial, sans-serif",
            "font-size": 5 * escala,
            fill: "#555555"
        }, `Programación de aplicaciones, riegos y campo — ${fechaTexto}`));

        // Mapa
        const mapaClon = svgOriginal.cloneNode(true);
        mapaClon.removeAttribute("id");
        mapaClon.setAttribute("x", 0);
        mapaClon.setAttribute("y", altoTitulo);
        mapaClon.setAttribute("width", anchoMapaSVG);
        mapaClon.setAttribute("height", altoMapaSVG);
        svgFinal.appendChild(mapaClon);

        // Cuadro Detalles
        dibujarPanelEnSVG(svgFinal, anchoMapaSVG + gap, altoTitulo, PANEL_ANCHO_SVG, altoCuerpo);

        // Leyenda
        const margen = 3 * escala;
        const yLeyenda = altoTitulo + altoCuerpo + 3 * escala;

        svgFinal.appendChild(crear("rect", {
            x: margen, y: yLeyenda,
            width: anchoTotal - margen * 2,
            height: altoTotal - yLeyenda - margen,
            rx: 0.8 * escala,
            fill: "#ffffff", stroke: "#374151",
            "stroke-width": 0.45 * escala
        }));

        svgFinal.appendChild(crear("text", {
            x: 10 * escala, y: yLeyenda + 6.5 * escala,
            "font-family": "Arial, sans-serif",
            "font-size": 5.2 * escala,
            "font-weight": "bold",
            fill: "#374151"
        }, "LEYENDA"));

        const anchoColumna = (anchoTotal - 20 * escala) / columnas;
        const inicioItemsY = yLeyenda + 12 * escala;

        items.forEach((item, indice) => {

            const col = indice % columnas;
            const fila = Math.floor(indice / columnas);

            const x = 10 * escala + col * anchoColumna;
            const y = inicioItemsY + fila * altoFila;

            dibujarSwatchLeyenda(svgFinal, item, x, y, escala);

            svgFinal.appendChild(crear("text", {
                x: x + 9 * escala,
                y: y + 3.8 * escala,
                "font-family": "Arial, sans-serif",
                "font-size": 4.2 * escala,
                fill: "#333333"
            }, item.texto));

        });

        // SVG -> PNG
        const xml = new XMLSerializer().serializeToString(svgFinal);
        const svgDataUrl = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(xml);

        const escalaExportacion = Math.max(3, Math.min(12, 4000 / anchoTotal));

        const imagen = new Image();

        imagen.onload = function () {

            const canvas = document.createElement("canvas");
            canvas.width = Math.round(anchoTotal * escalaExportacion);
            canvas.height = Math.round(altoTotal * escalaExportacion);

            const contexto = canvas.getContext("2d");
            contexto.fillStyle = "#ffffff";
            contexto.fillRect(0, 0, canvas.width, canvas.height);
            contexto.drawImage(imagen, 0, 0, canvas.width, canvas.height);

            const enlace = document.createElement("a");
            const fechaArchivo = fechaVistaHistorica || fechaLocalMapa();

            enlace.download = `mapa_fundo_santa_rosa_${fechaArchivo}.png`;
            enlace.href = canvas.toDataURL("image/png");

            document.body.appendChild(enlace);
            enlace.click();
            document.body.removeChild(enlace);

            restaurarBoton();
        };

        imagen.onerror = function () {
            console.error("No se pudo generar la imagen del mapa.");
            alert("No se pudo generar la imagen. Intente nuevamente.");
            restaurarBoton();
        };

        imagen.src = svgDataUrl;

    } catch (error) {

        console.error(error);
        alert("Ocurrió un error al generar la imagen del mapa.");
        restaurarBoton();

    }
}


/* =========================================================
   LEER LA LEYENDA DEL HTML
========================================================= */

function leerLeyendaDelDOM() {

    const resultado = [];

    document.querySelectorAll(".leyenda > span").forEach(item => {

        const texto = item.textContent.trim();
        if (!texto) return;
        if (item.dataset.oculto === "1") return;

        const swatchColor = item.querySelector(".color");
        const swatchOvalo = item.querySelector(".ovalo-paradero");
        const swatchFlecha = item.querySelector(".flecha");
        const swatchFranja = item.querySelector(".franja-leyenda");

        let tipo = "ninguno";
        let color = "#999999";

        if (swatchFlecha) {

            if (swatchFlecha.classList.contains("flecha-roja")) {
                tipo = "flecha-izquierda";
                color = "#dc2626";
            } else {
                tipo = "flecha-derecha";
                color = "#16a34a";
            }

        } else if (swatchFranja) {

            tipo = "franja";
            color = "#b91c1c";

        } else if (swatchOvalo) {

            tipo = "ovalo";
            color = getComputedStyle(swatchOvalo).backgroundColor;

        } else if (swatchColor) {

            tipo = "cuadro";
            color = getComputedStyle(swatchColor).backgroundColor;

        }

        resultado.push({ texto: texto, tipo: tipo, color: color });

    });

    return resultado;
}


/* =========================================================
   DIBUJAR SÍMBOLOS DE LA LEYENDA
========================================================= */

function dibujarSwatchLeyenda(svgFinal, item, x, y, escala) {

    const tamano = 5.5 * escala;

    if (item.tipo === "ninguno") return;

    if (item.tipo === "flecha-derecha" || item.tipo === "flecha-izquierda") {

        svgFinal.appendChild(crear("text", {
            x: x,
            y: y + tamano * 0.85,
            "font-size": tamano * 1.1,
            "font-weight": "bold",
            fill: item.color
        }, item.tipo === "flecha-derecha" ? "→" : "←"));

        return;
    }

    if (item.tipo === "franja") {

        svgFinal.appendChild(crear("rect", {
            x: x, y: y, width: tamano, height: tamano,
            fill: "none", stroke: "#b91c1c",
            "stroke-width": 1.2 * escala
        }));

        return;
    }

    if (item.tipo === "ovalo") {

        svgFinal.appendChild(crear("ellipse", {
            cx: x + tamano / 2, cy: y + tamano / 2,
            rx: tamano / 2, ry: tamano / 3.2,
            fill: item.color, stroke: "#1e3a8a",
            "stroke-width": 0.3 * escala
        }));

        return;
    }

    svgFinal.appendChild(crear("rect", {
        x: x, y: y, width: tamano, height: tamano,
        rx: 0.6 * escala,
        fill: item.color, stroke: "#999999",
        "stroke-width": 0.3 * escala
    }));
}
/* Adaptador de persistencia: los controles originales conservan su diseño. */
(function () {
  const nombres = ["registrarAplicacion", "eliminarAplicacion", "registrarRiego", "eliminarRiego", "registrarLabor", "modificarLabor", "eliminarLabor"];
  const originales = Object.fromEntries(nombres.map(n => [n, eval(n)]));
  let ocupado = false;
  const copia = obj => JSON.parse(JSON.stringify(obj));
  const snapshot = () => ({ aplicaciones: copia(aplicaciones), riegos: copia(riegos), labores: copia(labores) });
  const restaurar = anterior => { aplicaciones = anterior.aplicaciones; riegos = anterior.riegos; labores = anterior.labores; refrescarTodo(); };
  async function ejecutar(nombre) {
    if (ocupado) return;
    if (fechaVistaHistorica) { alert("Estás viendo un mapa histórico. Vuelve al mapa actual para registrar cambios."); return; }
    if (!window.santaDB?.listo) { alert("Inicie sesión y espere a que se carguen los datos de Supabase."); return; }
    ocupado = true;
    const anterior = snapshot();
    try {
      originales[nombre]();
      const actual = snapshot();
      await window.santaDB.sincronizar(anterior, actual);
    } catch (error) {
      restaurar(anterior);
      console.error(error);
      alert("No se pudo guardar en Supabase: " + (error.message || error));
    } finally { ocupado = false; }
  }
  registrarAplicacion = () => ejecutar("registrarAplicacion");
  eliminarAplicacion = () => ejecutar("eliminarAplicacion");
  registrarRiego = () => ejecutar("registrarRiego");
  eliminarRiego = () => ejecutar("eliminarRiego");
  registrarLabor = () => ejecutar("registrarLabor");
  modificarLabor = () => ejecutar("modificarLabor");
  eliminarLabor = () => ejecutar("eliminarLabor");
  window.santaAplicarDatos = function (datos) {
    datosVigentes = JSON.parse(JSON.stringify(datos));
    if (!fechaVistaHistorica) pintarDatosMapa(datosVigentes);
  };
})();
