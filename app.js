/* Reportes de mantenimiento – Flassservic S.A.S.
   Funciona sin internet: los datos quedan guardados en el celular (IndexedDB). */
'use strict';

// ---------- Utilidades ----------
const $ = (s, el = document) => el.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const hoy = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
const fmtFecha = f => { if (!f) return ''; const [y, m, d] = f.split('-'); return `${d}/${m}/${y}`; };
const ESTADOS = ['Pendiente', 'En proceso', 'Terminado'];
const SERVICIOS = ['Mantenimiento preventivo', 'Mantenimiento correctivo', 'Instalación', 'Revisión'];
const TIPOS = ['Ventana', 'Minisplit', 'Casette', 'Piso techo', 'Central', 'Paquete'];
const MEDIDAS = [['volt', 'Voltaje (V)'], ['amp', 'Corriente (A)'], ['btu', 'Capacidad BTU/H'], ['psi', 'Presión (PSI)']];
const PROG_INT = ['Limpieza interior y exterior del equipo', 'Limpieza serpentín evaporador / blower', 'Lavado bandeja y manguera de desagüe', 'Lavado de filtros de aire', 'Revisión motoventilador y sistema eléctrico', 'Configuración del control remoto'];
const PROG_EXT = ['Limpieza interior y exterior del equipo', 'Limpieza serpentín condensador / ventilador', 'Revisión bornes y conexiones del compresor', 'Revisión motoventilador y sistema eléctrico', 'Revisión tuberías / aislante térmico / carga de gas'];

// ---------- Almacenamiento (IndexedDB) ----------
const DB_NAME = 'reportes-flassservic';
let idb;
function abrirDB() {
  return new Promise((ok, mal) => {
    const r = indexedDB.open(DB_NAME, 1);
    r.onupgradeneeded = () => {
      const d = r.result;
      if (!d.objectStoreNames.contains('kv')) d.createObjectStore('kv');
      if (!d.objectStoreNames.contains('reportes')) d.createObjectStore('reportes', { keyPath: 'id' });
    };
    r.onsuccess = () => ok(r.result);
    r.onerror = () => mal(r.error);
  });
}
const tx = (st, modo, fn) => new Promise((ok, mal) => {
  const t = idb.transaction(st, modo); const s = t.objectStore(st); const res = fn(s);
  t.oncomplete = () => ok(res && res.result); t.onerror = () => mal(t.error);
});
const kvGet = k => tx('kv', 'readonly', s => s.get(k));
const kvSet = (k, v) => tx('kv', 'readwrite', s => s.put(v, k));
const repTodos = () => tx('reportes', 'readonly', s => s.getAll());
const repGuardar = r => tx('reportes', 'readwrite', s => s.put(r));
const repBorrar = id => tx('reportes', 'readwrite', s => s.delete(id));

// ---------- Datos iniciales ----------
function datosIniciales() {
  const sedes = [{ id: 's1', nombre: 'Pitalito' }, { id: 's2', nombre: 'Neiva' }, { id: 's3', nombre: 'Garzón' }];
  const clientes = [
    { id: 'c1', sedeId: 's1', tipo: 'Hospital', nombre: 'E.S.E. Hospital Departamental San Antonio de Pitalito', nit: '891.180.134-2', direccion: 'Calle 3 Sur No 1B-45', telefono: '8632500' },
    { id: 'c2', sedeId: 's1', tipo: 'Comité', nombre: 'Comité Departamental de Cafeteros del Huila', nit: '', direccion: '', telefono: '' },
    { id: 'c3', sedeId: 's2', tipo: 'Hospital', nombre: '', nit: '', direccion: '', telefono: '' },
    { id: 'c4', sedeId: 's2', tipo: 'Comité', nombre: 'Comité Departamental de Cafeteros del Huila', nit: '', direccion: '', telefono: '' },
    { id: 'c5', sedeId: 's3', tipo: 'Hospital', nombre: 'E.S.E. Hospital Departamental San Vicente de Paúl Garzón', nit: '891.180.026-5', direccion: 'Calle 7 No. 14-69', telefono: '8332533' },
    { id: 'c6', sedeId: 's3', tipo: 'Comité', nombre: 'Comité Departamental de Cafeteros del Huila', nit: '', direccion: '', telefono: '' }
  ];
  return {
    config: {
      usuario: 'Hector', nombreUsuario: 'Héctor Gonzalo Suárez Legarda', cedula: '', firma: '', clave: '1234', siguiente: 1,
      empresa: 'FLASSSERVIC S.A.S.', nit: 'NIT 900.740.386-7',
      pie: 'Sede Principal Calle 20 No. 23-46 Barrio Bello Horizonte, San José del Guaviare · Sucursal Carrera 42 No. 18a-08 Barrio Vergel, Neiva – Huila · flassservic.sas@hotmail.com · Cel. 350 286 6816 – 311 501 0236'
    },
    sedes, clientes, equipos: [],
    personal: []
  };
}

// ---------- Estado ----------
let M;            // datos maestros: config, sedes, clientes, equipos, personal
let R = [];       // reportes
let pila = [];    // historial de pantallas
let tabActual = 'sedes';
const guardarM = () => kvSet('maestro', M);
const cli = id => M.clientes.find(c => c.id === id);
const sede = id => M.sedes.find(s => s.id === id);
const equ = id => M.equipos.find(e => e.id === id);
const nomCli = c => c ? `${sede(c.sedeId)?.nombre || ''} - ${c.tipo}` : '';

// ---------- Mensajes y ventanas ----------
function toast(t) {
  const d = document.createElement('div'); d.className = 'toast'; d.textContent = t;
  document.body.appendChild(d); setTimeout(() => d.remove(), 2600);
}
function cargando(t) {
  const d = document.createElement('div'); d.className = 'cargando';
  d.innerHTML = `<div class="spin"></div><div>${esc(t)}</div>`; document.body.appendChild(d); return () => d.remove();
}
function ventana(html, alAbrir) {
  const m = document.createElement('div'); m.className = 'modal';
  m.innerHTML = `<div class="sheet">${html}</div>`;
  m.addEventListener('click', e => { if (e.target === m) m.remove(); });
  document.body.appendChild(m); alAbrir && alAbrir(m); return m;
}
function confirmar(titulo, texto, si = 'Sí', peligro = false) {
  return new Promise(ok => {
    const m = ventana(`<h3>${esc(titulo)}</h3><p class="muted">${esc(texto)}</p>
      <div class="acts"><button class="btn sec" data-n>Cancelar</button><button class="btn ${peligro ? 'rojo' : ''}" data-s>${esc(si)}</button></div>`);
    m.querySelector('[data-n]').onclick = () => { m.remove(); ok(false); };
    m.querySelector('[data-s]').onclick = () => { m.remove(); ok(true); };
  });
}
// Formulario genérico: campos [{k,label,tipo,opciones}]
function formulario(titulo, campos, valores = {}, extraBoton) {
  return new Promise(ok => {
    const html = `<h3>${esc(titulo)}</h3>` + campos.map(c => `<label class="l">${esc(c.label)}</label>` + (
      c.tipo === 'select'
        ? `<select class="inp" data-k="${c.k}">${c.opciones.map(o => `<option ${o === valores[c.k] ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select>`
        : `<input class="inp" data-k="${c.k}" type="${c.tipo || 'text'}" value="${esc(valores[c.k] ?? '')}" ${c.ph ? `placeholder="${esc(c.ph)}"` : ''}>`
    )).join('') + `<div class="acts">${extraBoton ? `<button class="btn rojo" data-x>${esc(extraBoton)}</button>` : ''}
      <button class="btn sec" data-n>Cancelar</button><button class="btn" data-s>Guardar</button></div>`;
    const m = ventana(html);
    m.querySelector('[data-n]').onclick = () => { m.remove(); ok(null); };
    const x = m.querySelector('[data-x]'); if (x) x.onclick = () => { m.remove(); ok('__borrar'); };
    m.querySelector('[data-s]').onclick = () => {
      const v = {}; m.querySelectorAll('[data-k]').forEach(i => v[i.dataset.k] = i.value.trim());
      m.remove(); ok(v);
    };
  });
}

// ---------- Navegación (con botón atrás del celular) ----------
function ir(pantalla, args = {}, reemplazar = false) {
  if (reemplazar) pila[pila.length - 1] = { pantalla, args };
  else { pila.push({ pantalla, args }); history.pushState({ n: pila.length }, ''); }
  pintar();
}
function atras() { history.back(); }
let ignorarPop = 0;
window.addEventListener('popstate', async () => {
  if (ignorarPop) { ignorarPop--; return; }
  if (document.querySelector('.sigwrap')) { document.querySelector('.sigwrap').remove(); history.pushState({}, ''); return; }
  const mod = document.querySelector('.modal'); if (mod) { mod.remove(); history.pushState({}, ''); return; }
  if (pila.length > 1) {
    const actual = pila[pila.length - 1];
    if (actual.pantalla === 'reporte' && actual.args._sucio) await guardarReporteActual(true);
    pila.pop(); pintar();
  } else history.pushState({}, '');
});

function pintar() {
  const { pantalla, args } = pila[pila.length - 1];
  window.scrollTo(0, 0);
  ({ login: vLogin, inicio: vInicio, cliente: vCliente, equipo: vEquipo, reporte: vReporte })[pantalla](args);
}

// ---------- Encabezado y barra ----------
function encabezado(titulo, sub, conAtras) {
  return `<div class="hdr">${conAtras ? '<button class="back" data-back>‹</button>' : ''}
    <div class="logo"><img src="logo.png" alt="Flassservic"></div>
    <div class="tit"><b>${esc(titulo)}</b><small>${esc(sub || '')}</small></div></div>`;
}
function barra() {
  const b = [['sedes', '🏠', 'Sedes'], ['reportes', '📋', 'Reportes'], ['ajustes', '⚙️', 'Ajustes']];
  return `<nav class="nav">${b.map(([k, i, t]) => `<button data-tab="${k}" class="${tabActual === k ? 'on' : ''}"><i>${i}</i>${t}</button>`).join('')}</nav>`;
}
function enlazarComunes(el) {
  el.querySelectorAll('[data-back]').forEach(b => b.onclick = atras);
  el.querySelectorAll('[data-tab]').forEach(b => b.onclick = () => { tabActual = b.dataset.tab; if (repActual && repActual.args._sucio) guardarReporteActual(true); pila = [{ pantalla: 'inicio', args: {} }]; pintar(); });
}

// ---------- Login ----------
function vLogin() {
  const app = $('#app');
  app.innerHTML = `<div class="login-top"><div class="logo"><img src="logo.png" alt="Flassservic"></div><p>REPORTES E INFORMES</p></div>
    <form class="login-box" id="fl"><h2>Inicia sesión</h2>
    <label class="l">Usuario</label><input class="inp" id="u" autocomplete="username" autocapitalize="off">
    <label class="l">Contraseña</label><input class="inp" id="c" type="password" autocomplete="current-password">
    <button class="btn full">Ingresar</button><div class="err" id="e"></div></form>`;
  $('#fl').onsubmit = e => {
    e.preventDefault();
    const u = $('#u').value.trim().toLowerCase(), c = $('#c').value;
    if (u === M.config.usuario.toLowerCase() && c === M.config.clave) {
      sessionStorage.setItem('ses', '1'); pila = [{ pantalla: 'inicio', args: {} }]; pintar();
    } else $('#e').textContent = 'Usuario o contraseña incorrectos';
  };
}

// ---------- Inicio (pestañas) ----------
function vInicio() {
  const app = $('#app');
  const titulos = { sedes: [M.config.nombreUsuario.split(' ')[0], 'Administrador'], reportes: ['Reportes', `${R.length} en total`], ajustes: ['Ajustes', 'Empresa, clave y respaldo'] };
  const [t, s] = titulos[tabActual];
  let cuerpo = '';
  if (tabActual === 'sedes') cuerpo = tSedes();
  if (tabActual === 'reportes') cuerpo = tReportes();
  if (tabActual === 'ajustes') cuerpo = tAjustes();
  app.innerHTML = encabezado(t, s) + `<div class="wrap">${cuerpo}</div>` + barra();
  enlazarComunes(app);
  ({ sedes: eSedes, reportes: eReportes, ajustes: eAjustes })[tabActual](app);
}

// Sedes
function tSedes() {
  const n = e => R.filter(r => r.estado === e).length;
  const mes = hoy().slice(0, 7);
  const term = R.filter(r => r.estado === 'Terminado' && (r.fecha || '').startsWith(mes)).length;
  return `<div class="stats"><div class="stat"><b>${n('Pendiente')}</b><span>Pendientes</span></div>
    <div class="stat"><b>${n('En proceso')}</b><span>En proceso</span></div>
    <div class="stat"><b>${term}</b><span>Terminados este mes</span></div></div>` +
    M.sedes.map(s => `<div class="card"><div class="row"><h3 class="grow">${esc(s.nombre)}</h3>
      <button class="chip add" data-esede="${s.id}">✎</button></div>
      <div class="chips">${M.clientes.filter(c => c.sedeId === s.id).map(c => {
        const p = R.filter(r => r.clienteId === c.id && r.estado !== 'Terminado').length;
        return `<button class="chip" data-cli="${c.id}">${esc(c.tipo)}${p ? ` · ${p}` : ''}</button>`;
      }).join('')}<button class="chip add" data-ncli="${s.id}">+ Cliente</button></div></div>`).join('') +
    `<button class="btn sec full" id="nsede" style="margin-top:6px">+ Agregar sede</button>`;
}
function eSedes(app) {
  app.querySelectorAll('[data-cli]').forEach(b => b.onclick = () => ir('cliente', { id: b.dataset.cli, tab: 'reportes' }));
  app.querySelectorAll('[data-ncli]').forEach(b => b.onclick = async () => {
    const v = await formulario('Nuevo cliente', [{ k: 'tipo', label: 'Tipo (como aparecerá en el botón)', ph: 'Hospital, Comité, Banco…' }, { k: 'nombre', label: 'Nombre o razón social' }, { k: 'nit', label: 'NIT / C.C.' }, { k: 'direccion', label: 'Dirección' }, { k: 'telefono', label: 'Teléfono', tipo: 'tel' }]);
    if (!v || !v.tipo) return;
    M.clientes.push({ id: uid(), sedeId: b.dataset.ncli, ...v }); await guardarM(); pintar();
  });
  app.querySelectorAll('[data-esede]').forEach(b => b.onclick = async () => {
    const s = sede(b.dataset.esede);
    const v = await formulario('Editar sede', [{ k: 'nombre', label: 'Nombre de la sede' }], s, 'Eliminar');
    if (v === '__borrar') {
      if (M.clientes.some(c => c.sedeId === s.id)) return toast('Primero elimine los clientes de esta sede');
      M.sedes = M.sedes.filter(x => x !== s);
    } else if (v && v.nombre) s.nombre = v.nombre; else return;
    await guardarM(); pintar();
  });
  $('#nsede').onclick = async () => {
    const v = await formulario('Nueva sede', [{ k: 'nombre', label: 'Nombre de la sede (municipio)' }]);
    if (v && v.nombre) { M.sedes.push({ id: uid(), nombre: v.nombre }); await guardarM(); pintar(); }
  };
}

// Lista de reportes reutilizable
function tarjetasReportes(lista) {
  if (!lista.length) return '<div class="empty">No hay reportes aquí todavía.</div>';
  return lista.sort((a, b) => (b.fecha || '').localeCompare(a.fecha || '') || b.numero - a.numero).map(r => {
    const e = r.equipo || {};
    return `<div class="card rep" data-rep="${r.id}"><div class="row"><span class="t grow">${esc((e.tipo || 'Equipo') + (r.area ? ' - ' + r.area : ''))}</span>
      <span class="badge ${esc(r.estado)}">${esc(r.estado)}</span></div>
      <div class="muted">N° ${r.numero} · ${fmtFecha(r.fecha)} · ${esc(nomCli(cli(r.clienteId)))}</div>
      ${r.observaciones ? `<p>${esc(r.observaciones.slice(0, 140))}</p>` : ''}</div>`;
  }).join('');
}
let filtroRep = 'Todos', textoRep = '';
function tReportes() {
  let l = R.slice();
  if (filtroRep !== 'Todos') l = l.filter(r => r.estado === filtroRep);
  if (textoRep) {
    const q = textoRep.toLowerCase();
    l = l.filter(r => JSON.stringify([r.numero, r.area, r.inventario, r.equipo, r.observaciones, r.repuestos, nomCli(cli(r.clienteId)), cli(r.clienteId)?.nombre]).toLowerCase().includes(q));
  }
  return `<input class="inp search" id="q" placeholder="Buscar por número, equipo, serie, área…" value="${esc(textoRep)}">
    <div class="tabs">${['Todos', ...ESTADOS].map(e => `<button class="tab ${filtroRep === e ? 'on' : ''}" data-f="${e}">${e}</button>`).join('')}</div>
    <div id="lista">${tarjetasReportes(l)}</div>
    <button class="btn sec full" id="csv">Exportar listado (Excel/CSV)</button>`;
}
function eReportes(app) {
  app.querySelectorAll('[data-f]').forEach(b => b.onclick = () => { filtroRep = b.dataset.f; pintar(); });
  const q = $('#q'); q.oninput = () => { textoRep = q.value; const p = q.selectionStart; pintar(); const n = $('#q'); n.focus(); n.setSelectionRange(p, p); };
  enlazarReps(app);
  $('#csv').onclick = exportarCSV;
}
function enlazarReps(el) { el.querySelectorAll('[data-rep]').forEach(c => c.onclick = () => ir('reporte', { id: c.dataset.rep })); }

// Ajustes
function tAjustes() {
  const c = M.config;
  return `<div class="sect">Empresa (sale en el PDF)</div>
    <div class="card"><label class="l">Razón social</label><input class="inp" id="a-emp" value="${esc(c.empresa)}">
    <label class="l">NIT</label><input class="inp" id="a-nit" value="${esc(c.nit)}">
    <label class="l">Pie de página</label><textarea class="inp" id="a-pie" rows="3">${esc(c.pie)}</textarea>
    <label class="l">Próximo número de reporte</label><input class="inp" id="a-sig" type="number" min="1" value="${c.siguiente}"></div>
    <div class="sect">Acceso</div>
    <div class="card"><label class="l">Nombre completo</label><input class="inp" id="a-nom" value="${esc(c.nombreUsuario)}">
    <label class="l">Cédula (sale bajo la firma del técnico)</label><input class="inp" id="a-ced" value="${esc(c.cedula || '')}" inputmode="numeric">
    <label class="l">Mi firma (se pone sola en cada reporte nuevo)</label>
    <div class="firma"><div class="pad" id="a-firma">${c.firma ? `<img src="${c.firma}">` : 'Tocar para firmar'}</div></div>
    <label class="l">Usuario</label><input class="inp" id="a-usu" value="${esc(c.usuario)}" autocapitalize="off">
    <label class="l">Nueva contraseña (déjela vacía para no cambiarla)</label><input class="inp" id="a-cla" type="password"></div>
    <button class="btn full" id="a-guardar" style="margin-top:4px">Guardar ajustes</button>
    <div class="sect">Respaldo</div>
    <div class="card"><p class="muted" style="margin-top:0">Todo queda guardado en este celular. Haga una copia de respaldo cada semana y guárdela en Drive o WhatsApp: si el celular se pierde o se borra el navegador, con esa copia recupera todo.</p>
    <button class="btn sm" id="a-exp">Descargar copia de respaldo</button>
    <button class="btn sm sec" id="a-imp">Restaurar copia</button><input type="file" id="a-file" accept=".json,application/json" hidden></div>
    <p class="muted" id="a-esp"></p>
    <button class="btn rojo full" id="salir">Salir</button>`;
}
function eAjustes(app) {
  $('#a-guardar').onclick = async () => {
    const c = M.config;
    c.empresa = $('#a-emp').value.trim(); c.nit = $('#a-nit').value.trim(); c.pie = $('#a-pie').value.trim();
    c.siguiente = Math.max(1, parseInt($('#a-sig').value) || 1);
    c.cedula = $('#a-ced').value.trim(); c.nombreUsuario = $('#a-nom').value.trim() || c.nombreUsuario; c.usuario = $('#a-usu').value.trim() || c.usuario;
    if ($('#a-cla').value) c.clave = $('#a-cla').value;
    await guardarM(); toast('Ajustes guardados'); pintar();
  };
  $('#a-firma').onclick = () => tomarFirma('Mi firma', async img => { M.config.firma = img; await guardarM(); $('#a-firma').innerHTML = img ? `<img src="${img}">` : 'Tocar para firmar'; toast('Firma guardada'); });
  $('#a-exp').onclick = exportarRespaldo;
  $('#a-imp').onclick = () => $('#a-file').click();
  $('#a-file').onchange = importarRespaldo;
  $('#salir').onclick = () => { sessionStorage.removeItem('ses'); pila = [{ pantalla: 'login', args: {} }]; pintar(); };
  if (navigator.storage && navigator.storage.estimate) navigator.storage.estimate().then(e => {
    const el = $('#a-esp'); if (el) el.textContent = `Espacio usado: ${(e.usage / 1048576).toFixed(1)} MB de ${(e.quota / 1048576 / 1024).toFixed(1)} GB disponibles.`;
  });
}

// ---------- Cliente ----------
function vCliente(a) {
  const c = cli(a.id); const app = $('#app');
  const reps = R.filter(r => r.clienteId === c.id);
  const eqs = M.equipos.filter(e => e.clienteId === c.id);
  let cuerpo = `<div class="tabs">${[['reportes', `Reportes (${reps.length})`], ['equipos', `Equipos (${eqs.length})`], ['datos', 'Datos del cliente']].map(([k, t]) => `<button class="tab ${a.tab === k ? 'on' : ''}" data-t="${k}">${t}</button>`).join('')}</div>`;
  if (a.tab === 'reportes') cuerpo += `<div class="tabs">${['Todos', ...ESTADOS].map(e => `<button class="tab ${(a.f || 'Todos') === e ? 'on' : ''}" data-f="${e}">${e}</button>`).join('')}</div>` +
    tarjetasReportes(reps.filter(r => !a.f || a.f === 'Todos' || r.estado === a.f));
  if (a.tab === 'equipos') cuerpo += (eqs.length ? eqs.map(e => {
    const ult = R.filter(r => r.equipoId === e.id).sort((x, y) => (y.fecha || '').localeCompare(x.fecha || ''))[0];
    return `<div class="card rep" data-eq="${e.id}"><div class="row"><span class="t grow">${esc(e.tipo || 'Equipo')} ${esc(e.marca || '')}</span><span class="muted">Inv. ${esc(e.inventario || '—')}</span></div>
      <div class="muted">${esc(e.area || 'Sin área')} · Serie ${esc(e.serie || '—')}</div>
      <div style="font-size:12.5px;margin-top:4px">${ult ? `Último servicio: ${fmtFecha(ult.fecha)} (${esc(ult.estado)})` : 'Sin servicios registrados'}</div></div>`;
  }).join('') : '<div class="empty">Aún no hay equipos. Se agregan solos al guardar un reporte, o con el botón de abajo.</div>') +
    `<button class="btn sec full" id="neq">+ Agregar equipo</button>`;
  if (a.tab === 'datos') cuerpo += `<div class="card">
    <label class="l">Botón (tipo)</label><input class="inp" id="d-tipo" value="${esc(c.tipo)}">
    <label class="l">Nombre o razón social</label><input class="inp" id="d-nombre" value="${esc(c.nombre)}">
    <label class="l">NIT / C.C.</label><input class="inp" id="d-nit" value="${esc(c.nit)}">
    <label class="l">Dirección</label><input class="inp" id="d-dir" value="${esc(c.direccion)}">
    <label class="l">Teléfono</label><input class="inp" id="d-tel" value="${esc(c.telefono)}" type="tel">
    <button class="btn full" id="d-ok">Guardar datos</button></div>
    <button class="btn rojo sm" id="d-del" style="margin-top:8px">Eliminar cliente</button>`;
  app.innerHTML = encabezado(nomCli(c), M.config.nombreUsuario.split(' ')[0], true) + `<div class="wrap">${cuerpo}</div>` +
    `<button class="fab" id="nrep">+ Nuevo reporte</button>` + barra();
  enlazarComunes(app); enlazarReps(app);
  app.querySelectorAll('[data-t]').forEach(b => b.onclick = () => ir('cliente', { ...a, tab: b.dataset.t }, true));
  app.querySelectorAll('[data-f]').forEach(b => b.onclick = () => ir('cliente', { ...a, f: b.dataset.f }, true));
  app.querySelectorAll('[data-eq]').forEach(b => b.onclick = () => ir('equipo', { id: b.dataset.eq }));
  $('#nrep').onclick = () => nuevoReporte(c.id);
  const neq = $('#neq'); if (neq) neq.onclick = async () => {
    const v = await formulario('Nuevo equipo', camposEq, { tipo: 'Minisplit' });
    if (v) { M.equipos.push({ id: uid(), clienteId: c.id, ...v }); await guardarM(); pintar(); }
  };
  const ok = $('#d-ok'); if (ok) {
    ok.onclick = async () => {
      Object.assign(c, { tipo: $('#d-tipo').value.trim() || c.tipo, nombre: $('#d-nombre').value.trim(), nit: $('#d-nit').value.trim(), direccion: $('#d-dir').value.trim(), telefono: $('#d-tel').value.trim() });
      await guardarM(); toast('Datos del cliente guardados'); pintar();
    };
    $('#d-del').onclick = async () => {
      if (reps.length) return toast('Este cliente tiene reportes; no se puede eliminar');
      if (await confirmar('Eliminar cliente', '¿Seguro?', 'Eliminar', true)) { M.clientes = M.clientes.filter(x => x !== c); M.equipos = M.equipos.filter(e => e.clienteId !== c.id); await guardarM(); atras(); }
    };
  }
}
const camposEq = [{ k: 'tipo', label: 'Tipo', tipo: 'select', opciones: TIPOS }, { k: 'producto', label: 'Producto', ph: 'Aire acondicionado split' }, { k: 'marca', label: 'Marca' }, { k: 'modelo', label: 'Modelo' }, { k: 'serie', label: 'Serie' }, { k: 'area', label: 'Área / ubicación' }, { k: 'inventario', label: 'Inventario No.' }];

// ---------- Equipo (hoja de vida) ----------
function vEquipo(a) {
  const e = equ(a.id); const c = cli(e.clienteId); const app = $('#app');
  const reps = R.filter(r => r.equipoId === e.id);
  app.innerHTML = encabezado('Hoja de vida', nomCli(c), true) + `<div class="wrap">
    <div class="card"><div class="kv">${camposEq.map(f => `<span>${f.label}</span><b>${esc(e[f.k] || '—')}</b>`).join('')}</div>
    <div class="row" style="margin-top:10px"><button class="btn sm sec" id="eeq">Editar</button><button class="btn sm rojo" id="deq">Eliminar</button></div></div>
    <div class="sect">Historial de servicios (${reps.length})</div>${tarjetasReportes(reps)}</div>
    <button class="fab" id="nrep">+ Nuevo servicio</button>` + barra();
  enlazarComunes(app); enlazarReps(app);
  $('#nrep').onclick = () => nuevoReporte(c.id, e.id);
  $('#eeq').onclick = async () => { const v = await formulario('Editar equipo', camposEq, e); if (v) { Object.assign(e, v); await guardarM(); pintar(); } };
  $('#deq').onclick = async () => {
    if (await confirmar('Eliminar equipo', 'Los reportes de este equipo se conservan.', 'Eliminar', true)) {
      M.equipos = M.equipos.filter(x => x !== e); R.forEach(r => { if (r.equipoId === e.id) { r.equipoId = null; repGuardar(r); } }); await guardarM(); atras();
    }
  };
}

// ---------- Reporte ----------
function reporteVacio(clienteId, equipoId) {
  const r = {
    id: uid(), numero: null, clienteId, equipoId: equipoId || null, fecha: hoy(), estado: 'Pendiente',
    servicio: ['Mantenimiento preventivo'], area: '', inventario: '', equipo: { tipo: 'Minisplit', producto: '', marca: '', modelo: '', serie: '' },
    medidas: {}, progInt: [], progExt: [], repuestos: '', observaciones: '', horaIni: '', horaFin: '',
    fotos: [], firmaTec: M.config.firma || '', firmaCli: '', nombreCli: '', cedulaCli: '', creado: Date.now(), modificado: Date.now()
  };
  const e = equipoId && equ(equipoId);
  if (e) { r.area = e.area || ''; r.inventario = e.inventario || ''; r.equipo = { tipo: e.tipo || '', producto: e.producto || '', marca: e.marca || '', modelo: e.modelo || '', serie: e.serie || '' }; }
  return r;
}
async function nuevoReporte(clienteId, equipoId) {
  if (!equipoId) {
    const eqs = M.equipos.filter(e => e.clienteId === clienteId);
    if (eqs.length) {
      equipoId = await new Promise(ok => {
        const m = ventana(`<h3>¿Para qué equipo?</h3><p class="muted">Elija un equipo ya registrado para llenar sus datos solos, o empiece en blanco.</p>
          ${eqs.map(e => `<div class="card rep" data-e="${e.id}"><b>${esc(e.tipo)} ${esc(e.marca)}</b><div class="muted">${esc(e.area || '')} · Inv. ${esc(e.inventario || '—')} · Serie ${esc(e.serie || '—')}</div></div>`).join('')}
          <div class="acts"><button class="btn sec" data-b>Equipo nuevo</button></div>`);
        m.querySelectorAll('[data-e]').forEach(d => d.onclick = () => { m.remove(); ok(d.dataset.e); });
        m.querySelector('[data-b]').onclick = () => { m.remove(); ok(null); };
      });
    }
  }
  const r = reporteVacio(clienteId, equipoId);
  r.numero = M.config.siguiente++; await guardarM();
  R.push(r); await repGuardar(r);
  ir('reporte', { id: r.id });
}

let repActual = null;
function vReporte(a) {
  const r = R.find(x => x.id === a.id); repActual = { r, args: a };
  const c = cli(r.clienteId) || {}; const app = $('#app');
  const chk = (lista, v) => lista.includes(v) ? 'checked' : '';
  const med = (k, p) => esc((r.medidas[k] || {})[p] || '');
  app.innerHTML = encabezado('REPORTE DE MANTENIMIENTO', `N° ${r.numero} · ${nomCli(c)}`, true) + `<div class="wrap" id="frm" style="padding-bottom:calc(100px + var(--safe-bot))">
    <div class="saved" id="guard"></div>
    <div class="f-sect">ESTADO</div>
    <div class="estado-sel">${ESTADOS.map(e => `<button class="${r.estado === e ? 'on' : ''} ${e.split(' ')[0]}" data-est="${e}">${e}</button>`).join('')}</div>

    <div class="f-sect">DATOS DEL CLIENTE</div>
    <table class="f"><tr><td class="k">NOMBRE</td><td><input value="${esc(c.nombre)}" data-c="nombre" placeholder="Nombre completo"></td></tr>
    <tr><td class="k">NIT / C.C.</td><td><input value="${esc(c.nit)}" data-c="nit" placeholder="000.000.000-0"></td></tr>
    <tr><td class="k">DIRECCIÓN</td><td><input value="${esc(c.direccion)}" data-c="direccion" placeholder="Dirección"></td></tr>
    <tr><td class="k">TELÉFONO</td><td><input value="${esc(c.telefono)}" data-c="telefono" placeholder="Teléfono" inputmode="tel"></td></tr></table>

    <div class="boxes" style="margin-top:10px"><div class="box" style="flex:1.7"><h4>TIPO DE SERVICIO</h4>
      ${SERVICIOS.map(s => `<label class="ck"><span>${s.toUpperCase()}</span><input type="checkbox" data-serv="${s}" ${chk(r.servicio, s)}></label>`).join('')}</div>
      <div class="box"><h4>REPORTE</h4><div class="num">${r.numero}</div><h4 style="border:0;padding-bottom:0">FECHA</h4>
      <input type="date" data-r="fecha" value="${esc(r.fecha)}" style="width:100%;border:0;text-align:center;padding:6px 2px;font-size:12.5px;background:transparent"></div></div>

    <table class="f" style="margin-top:10px"><tr><td class="k">ÁREA/UBICACIÓN</td><td><input data-r="area" value="${esc(r.area)}"></td></tr>
    <tr><td class="k">INVENTARIO No.</td><td><input data-r="inventario" value="${esc(r.inventario)}"></td></tr></table>

    <div class="f-sect">DESCRIPCIÓN DE LOS EQUIPOS</div>
    <table class="f"><tr><td class="k">TIPO</td><td><div class="tipos">${TIPOS.map(t => `<label><input type="radio" name="tipo" data-tipo="${t}" ${r.equipo.tipo === t ? 'checked' : ''}>${t}</label>`).join('')}</div></td></tr>
    ${[['producto', 'PRODUCTO'], ['marca', 'MARCA'], ['modelo', 'MODELO'], ['serie', 'SERIE']].map(([k, t]) => `<tr><td class="k">${t}</td><td><input data-eq="${k}" value="${esc(r.equipo[k])}"></td></tr>`).join('')}</table>

    <div class="f-sect">INFORMACIÓN SISTEMA ELÉCTRICO Y DE REFRIGERACIÓN</div>
    <table class="f"><tr><th rowspan="2" style="width:27%"></th><th colspan="2">DATOS DE PLACA</th><th colspan="2">MEDICIÓN ACTUAL</th></tr>
    <tr><th>EVAP.</th><th>COND.</th><th>EVAP.</th><th>COND.</th></tr>
    ${MEDIDAS.map(([k, t]) => `<tr><td class="k" style="font-size:10px">${t.toUpperCase()}</td>${['pe', 'pc', 'me', 'mc'].map(p => `<td><input class="c" data-m="${k}" data-p="${p}" value="${med(k, p)}" inputmode="decimal"></td>`).join('')}</tr>`).join('')}</table>

    <div class="f-sect">PROGRAMA DE MANTENIMIENTO</div>
    <table class="f"><tr><th colspan="2">UNIDAD INTERNA EVAPORADORA</th><th colspan="2">UNIDAD EXTERNA CONDENSADORA</th></tr>
    ${PROG_INT.map((t, i) => `<tr><td class="it">${t.toUpperCase()}</td><td class="x"><input type="checkbox" data-pi="${i}" ${r.progInt.includes(i) ? 'checked' : ''}></td>
      ${PROG_EXT[i] ? `<td class="it">${PROG_EXT[i].toUpperCase()}</td><td class="x"><input type="checkbox" data-pe="${i}" ${r.progExt.includes(i) ? 'checked' : ''}></td>` : '<td></td><td></td>'}</tr>`).join('')}</table>
    <button class="btn sm sec" id="todo" style="margin-top:8px">Marcar todo</button>

    <div class="f-sect">REPUESTOS REQUERIDOS</div><textarea class="area" data-r="repuestos">${esc(r.repuestos)}</textarea>
    <div class="f-sect">OBSERVACIONES</div><textarea class="area" data-r="observaciones" style="min-height:90px">${esc(r.observaciones)}</textarea>

    <div class="f-sect">HORARIO</div>
    <table class="f"><tr><td class="k">HORA INICIO</td><td><input type="time" data-r="horaIni" value="${esc(r.horaIni)}"></td></tr>
    <tr><td class="k">HORA FIN</td><td><input type="time" data-r="horaFin" value="${esc(r.horaFin)}"></td></tr></table>

    <div class="f-sect">REGISTRO FOTOGRÁFICO</div>
    <div class="fotos" id="fotos"></div>
    <div class="row" style="margin-top:8px"><button class="btn sm" id="f-antes">📷 Foto antes</button><button class="btn sm" id="f-desp" style="background:var(--verde)">📷 Foto después</button></div>
    <input type="file" id="f-file" accept="image/*" capture="environment" hidden multiple>

    <div class="f-sect">FIRMAS</div>
    <div class="firmas"><div class="firma"><div class="pad" data-sig="firmaTec">${r.firmaTec ? `<img src="${r.firmaTec}">` : 'Tomar firma'}</div><div class="lin">TÉCNICO</div><div class="muted" style="font-size:11px">${esc(M.config.nombreUsuario)}</div></div>
    <div class="firma"><div class="pad" data-sig="firmaCli">${r.firmaCli ? `<img src="${r.firmaCli}">` : 'Tomar firma'}</div><div class="lin">CLIENTE</div></div></div>
    <table class="f" style="margin-top:8px"><tr><td class="k">RECIBE (CLIENTE)</td><td><input data-r="nombreCli" value="${esc(r.nombreCli)}" placeholder="Nombre de quien recibe"></td></tr>
    <tr><td class="k">CÉDULA / CARGO</td><td><input data-r="cedulaCli" value="${esc(r.cedulaCli)}"></td></tr></table>
    <p class="pie">${esc(M.config.pie)}</p>
    <div class="row" style="margin-top:16px"><button class="btn sm sec" id="dup">Duplicar para otro equipo</button><button class="btn sm rojo" id="borrar">Eliminar</button></div>
    </div>
    <div class="bar"><button class="btn sec" id="g">Guardar</button><button class="btn" id="pdf">Generar PDF</button></div>`;
  enlazarComunes(app);
  pintarFotos();
  const frm = $('#frm');
  const sucio = () => { a._sucio = true; $('#guard').textContent = ''; programarGuardado(); };
  frm.querySelectorAll('[data-r]').forEach(i => i.addEventListener('input', () => { r[i.dataset.r] = i.value; sucio(); }));
  frm.querySelectorAll('[data-c]').forEach(i => i.addEventListener('input', () => { c[i.dataset.c] = i.value; a._cli = true; sucio(); }));
  frm.querySelectorAll('[data-eq]').forEach(i => i.addEventListener('input', () => { r.equipo[i.dataset.eq] = i.value; sucio(); }));
  frm.querySelectorAll('[data-tipo]').forEach(i => i.addEventListener('change', () => { r.equipo.tipo = i.dataset.tipo; sucio(); }));
  frm.querySelectorAll('[data-serv]').forEach(i => i.addEventListener('change', () => { r.servicio = [...frm.querySelectorAll('[data-serv]:checked')].map(x => x.dataset.serv); sucio(); }));
  frm.querySelectorAll('[data-m]').forEach(i => i.addEventListener('input', () => { (r.medidas[i.dataset.m] ||= {})[i.dataset.p] = i.value; sucio(); }));
  const progs = () => { r.progInt = [...frm.querySelectorAll('[data-pi]:checked')].map(x => +x.dataset.pi); r.progExt = [...frm.querySelectorAll('[data-pe]:checked')].map(x => +x.dataset.pe); sucio(); };
  frm.querySelectorAll('[data-pi],[data-pe]').forEach(i => i.addEventListener('change', progs));
  $('#todo').onclick = () => { const all = [...frm.querySelectorAll('[data-pi],[data-pe]')]; const marcar = all.some(x => !x.checked); all.forEach(x => x.checked = marcar); progs(); };
  frm.querySelectorAll('[data-est]').forEach(b => b.onclick = () => {
    r.estado = b.dataset.est; frm.querySelectorAll('[data-est]').forEach(x => x.classList.toggle('on', x === b)); sucio();
  });
  frm.querySelectorAll('[data-sig]').forEach(p => p.onclick = () => tomarFirma(p.dataset.sig === 'firmaTec' ? 'Firma del técnico' : 'Firma del cliente', img => {
    r[p.dataset.sig] = img; p.innerHTML = img ? `<img src="${img}">` : 'Tomar firma'; sucio();
  }));
  let momento = 'antes';
  $('#f-antes').onclick = () => { momento = 'antes'; $('#f-file').click(); };
  $('#f-desp').onclick = () => { momento = 'despues'; $('#f-file').click(); };
  $('#f-file').onchange = async e => {
    const fin = cargando('Procesando fotos…');
    try { for (const f of e.target.files) r.fotos.push({ id: uid(), data: await reducirFoto(f), momento, nota: '' }); }
    finally { fin(); e.target.value = ''; }
    pintarFotos(); sucio();
  };
  $('#g').onclick = async () => { await guardarReporteActual(); toast('Reporte guardado'); };
  $('#pdf').onclick = async () => { await guardarReporteActual(true); generarPDF(r); };
  $('#borrar').onclick = async () => {
    if (await confirmar('Eliminar reporte', `¿Eliminar el reporte N° ${r.numero}? No se puede deshacer.`, 'Eliminar', true)) {
      clearTimeout(tGuardar); a._sucio = false; R = R.filter(x => x !== r); await repBorrar(r.id); atras();
    }
  };
  $('#dup').onclick = async () => {
    await guardarReporteActual(true);
    const n = JSON.parse(JSON.stringify(r));
    Object.assign(n, { id: uid(), numero: M.config.siguiente++, equipoId: null, area: '', inventario: '', fotos: [], firmaTec: r.firmaTec, firmaCli: '', estado: 'Pendiente', medidas: {}, creado: Date.now(), modificado: Date.now() });
    n.equipo = { ...r.equipo, serie: '' };
    await guardarM(); R.push(n); await repGuardar(n); toast(`Creado reporte N° ${n.numero}`); ir('reporte', { id: n.id }, true);
  };
}
function pintarFotos() {
  const { r } = repActual; const el = $('#fotos'); if (!el) return;
  el.innerHTML = r.fotos.length ? r.fotos.map(f => `<div class="foto"><span class="tag ${f.momento}">${f.momento === 'antes' ? 'ANTES' : 'DESPUÉS'}</span>
    <img src="${f.data}"><button class="del" data-del="${f.id}">✕</button><input data-nota="${f.id}" value="${esc(f.nota)}" placeholder="Descripción de la foto"></div>`).join('')
    : '<div class="muted" style="grid-column:1/-1">Sin fotos. Las fotos salen en una segunda hoja del PDF.</div>';
  el.querySelectorAll('[data-del]').forEach(b => b.onclick = async () => {
    if (await confirmar('Quitar foto', '¿Quitar esta foto del reporte?', 'Quitar', true)) { r.fotos = r.fotos.filter(f => f.id !== b.dataset.del); pintarFotos(); repActual.args._sucio = true; programarGuardado(); }
  });
  el.querySelectorAll('[data-nota]').forEach(i => i.oninput = () => { r.fotos.find(f => f.id === i.dataset.nota).nota = i.value; repActual.args._sucio = true; programarGuardado(); });
}
let tGuardar;
function programarGuardado() { clearTimeout(tGuardar); tGuardar = setTimeout(() => guardarReporteActual(true), 1200); }
async function guardarReporteActual(silencioso) {
  clearTimeout(tGuardar);
  if (!repActual) return;
  const { r, args } = repActual;
  if (!R.includes(r)) return;
  r.modificado = Date.now();
  // Registrar o actualizar el equipo en el inventario del cliente
  const e = r.equipo; const tieneDatos = e.serie || e.modelo || e.marca || r.inventario;
  if (tieneDatos) {
    let eq = r.equipoId && equ(r.equipoId);
    if (!eq) eq = M.equipos.find(x => x.clienteId === r.clienteId && ((e.serie && x.serie === e.serie) || (r.inventario && x.inventario === r.inventario)));
    if (!eq) { eq = { id: uid(), clienteId: r.clienteId }; M.equipos.push(eq); }
    Object.assign(eq, { tipo: e.tipo, producto: e.producto, marca: e.marca, modelo: e.modelo, serie: e.serie, area: r.area, inventario: r.inventario });
    r.equipoId = eq.id; args._cli = true;
  }
  await repGuardar(r);
  if (args._cli) { await guardarM(); args._cli = false; }
  args._sucio = false;
  const g = $('#guard'); if (g) g.textContent = '✓ Guardado en el celular';
}

// ---------- Fotos: reducir tamaño ----------
function reducirFoto(file, max = 1400, q = 0.72) {
  return new Promise((ok, mal) => {
    const url = URL.createObjectURL(file); const img = new Image();
    img.onload = () => {
      let { width: w, height: h } = img; const s = Math.min(1, max / Math.max(w, h)); w = Math.round(w * s); h = Math.round(h * s);
      const cv = document.createElement('canvas'); cv.width = w; cv.height = h; cv.getContext('2d').drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(url); ok(cv.toDataURL('image/jpeg', q));
    };
    img.onerror = () => { URL.revokeObjectURL(url); mal(new Error('No se pudo leer la foto')); };
    img.src = url;
  });
}

// ---------- Firma ----------
function tomarFirma(titulo, alTerminar) {
  history.pushState({ firma: 1 }, '');
  const w = document.createElement('div'); w.className = 'sigwrap';
  w.innerHTML = `<div class="sigbar"><button class="btn sm sec" data-c>Cancelar</button><b>${esc(titulo)}</b><button class="btn sm sec" data-l>Limpiar</button><button class="btn sm" data-g>Guardar firma</button></div>
    <canvas class="sigcanvas"></canvas><div class="sighint">Firme con el dedo dentro del recuadro blanco</div>`;
  document.body.appendChild(w);
  const cv = w.querySelector('canvas'); const ctx = cv.getContext('2d'); let trazos = 0;
  const dpr = window.devicePixelRatio || 1;
  const ajustar = () => { const r = cv.getBoundingClientRect(); cv.width = r.width * dpr; cv.height = r.height * dpr; ctx.scale(dpr, dpr); ctx.lineWidth = 2.6; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = '#0b1a3a'; trazos = 0; };
  ajustar();
  let dib = false, last;
  const pos = e => { const r = cv.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
  cv.onpointerdown = e => { dib = true; last = pos(e); cv.setPointerCapture(e.pointerId); ctx.beginPath(); ctx.arc(last[0], last[1], 1.2, 0, 7); ctx.fillStyle = '#0b1a3a'; ctx.fill(); trazos++; };
  cv.onpointermove = e => { if (!dib) return; const p = pos(e); ctx.beginPath(); ctx.moveTo(...last); ctx.lineTo(...p); ctx.stroke(); last = p; };
  cv.onpointerup = cv.onpointercancel = () => dib = false;
  const cerrar = () => { w.remove(); ignorarPop++; history.back(); };
  w.querySelector('[data-c]').onclick = cerrar;
  w.querySelector('[data-l]').onclick = () => { ctx.clearRect(0, 0, cv.width, cv.height); trazos = 0; };
  w.querySelector('[data-g]').onclick = () => {
    if (!trazos) { alTerminar(''); cerrar(); return; }
    // recortar al área firmada
    const d = ctx.getImageData(0, 0, cv.width, cv.height).data; let x0 = cv.width, y0 = cv.height, x1 = 0, y1 = 0;
    for (let y = 0; y < cv.height; y += 2) for (let x = 0; x < cv.width; x += 2) if (d[(y * cv.width + x) * 4 + 3] > 10) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    const m = 12 * dpr; x0 = Math.max(0, x0 - m); y0 = Math.max(0, y0 - m); x1 = Math.min(cv.width, x1 + m); y1 = Math.min(cv.height, y1 + m);
    const out = document.createElement('canvas'); const sc = Math.min(1, 700 / (x1 - x0));
    out.width = (x1 - x0) * sc; out.height = (y1 - y0) * sc;
    out.getContext('2d').drawImage(cv, x0, y0, x1 - x0, y1 - y0, 0, 0, out.width, out.height);
    alTerminar(out.toDataURL('image/png')); cerrar();
  };
}

// ---------- PDF ----------
function hojaPDF(r) {
  const c = cli(r.clienteId) || {}; const cf = M.config;
  const sq = v => `<span class="sq">${v ? 'X' : ''}</span>`;
  const med = (k, p) => esc((r.medidas[k] || {})[p] || '');
  const cab = `<div class="ph"><div><img src="logo.png"><div class="nit">${esc(cf.nit)}</div></div><div class="tt"><b>REPORTE DE MANTENIMIENTO</b>N° ${r.numero} · ${fmtFecha(r.fecha)}</div></div>`;
  const pie = `<div class="pp">${esc(cf.pie)}</div>`;
  const p1 = `<div class="pg">${cab}
    <div class="st">DATOS DEL CLIENTE</div>
    <table><tr><td class="k">NOMBRE</td><td colspan="3">${esc(c.nombre)}</td></tr>
    <tr><td class="k">NIT / C.C.</td><td>${esc(c.nit)}</td><td class="k">TELÉFONO</td><td>${esc(c.telefono)}</td></tr>
    <tr><td class="k">DIRECCIÓN</td><td>${esc(c.direccion)}</td><td class="k">SEDE</td><td>${esc(sede(c.sedeId)?.nombre || '')}</td></tr></table>
    <table><tr><th colspan="4">TIPO DE SERVICIO</th><th style="width:16%">REPORTE</th><th style="width:16%">FECHA</th></tr>
    <tr>${SERVICIOS.map(s => `<td>${sq(r.servicio.includes(s))}${s.toUpperCase()}</td>`).join('')}<td style="text-align:center;font-size:16px;font-weight:800;color:#122a5c">${r.numero}</td><td style="text-align:center">${fmtFecha(r.fecha)}</td></tr></table>
    <table><tr><td class="k">ÁREA/UBICACIÓN</td><td>${esc(r.area)}</td><td class="k">INVENTARIO No.</td><td>${esc(r.inventario)}</td></tr></table>
    <div class="st">DESCRIPCIÓN DE LOS EQUIPOS</div>
    <table><tr><td class="k">TIPO</td><td colspan="3">${TIPOS.map(t => `${sq(r.equipo.tipo === t)}${t}&nbsp;&nbsp;&nbsp;`).join('')}</td></tr>
    <tr><td class="k">PRODUCTO</td><td>${esc(r.equipo.producto)}</td><td class="k">MARCA</td><td>${esc(r.equipo.marca)}</td></tr>
    <tr><td class="k">MODELO</td><td>${esc(r.equipo.modelo)}</td><td class="k">SERIE</td><td>${esc(r.equipo.serie)}</td></tr></table>
    <div class="st">INFORMACIÓN SISTEMA ELÉCTRICO Y DE REFRIGERACIÓN</div>
    <table><tr><th rowspan="2"></th><th colspan="2">DATOS DE PLACA</th><th colspan="2">MEDICIÓN ACTUAL</th></tr><tr><th>EVAP.</th><th>COND.</th><th>EVAP.</th><th>COND.</th></tr>
    ${MEDIDAS.map(([k, t]) => `<tr><td class="k">${t.toUpperCase()}</td>${['pe', 'pc', 'me', 'mc'].map(p => `<td style="text-align:center">${med(k, p)}</td>`).join('')}</tr>`).join('')}</table>
    <div class="st">PROGRAMA DE MANTENIMIENTO</div>
    <table><tr><th>UNIDAD INTERNA EVAPORADORA</th><th style="width:6%"></th><th>UNIDAD EXTERNA CONDENSADORA</th><th style="width:6%"></th></tr>
    ${PROG_INT.map((t, i) => `<tr><td>${t.toUpperCase()}</td><td style="text-align:center;font-weight:700">${r.progInt.includes(i) ? 'X' : ''}</td><td>${(PROG_EXT[i] || '').toUpperCase()}</td><td style="text-align:center;font-weight:700">${PROG_EXT[i] && r.progExt.includes(i) ? 'X' : ''}</td></tr>`).join('')}</table>
    <div class="st">REPUESTOS REQUERIDOS</div><div class="txt">${esc(r.repuestos)}</div>
    <div class="st">OBSERVACIONES</div><div class="txt" style="min-height:56px">${esc(r.observaciones)}</div>
    <table><tr><td class="k">RESPONSABLE</td><td>${esc(cf.nombreUsuario)}</td><td class="k">HORARIO</td><td>${esc(r.horaIni)}${r.horaFin ? ' – ' + esc(r.horaFin) : ''}</td></tr></table>
    <div class="st">FIRMAS</div>
    <div class="fr"><div><div class="im">${r.firmaTec ? `<img src="${r.firmaTec}">` : ''}</div><div class="ln">TÉCNICO</div><div class="sub">${esc(cf.nombreUsuario)}${cf.cedula ? ' · C.C. ' + esc(cf.cedula) : ''}</div></div>
    <div><div class="im">${r.firmaCli ? `<img src="${r.firmaCli}">` : ''}</div><div class="ln">CLIENTE</div><div class="sub">${esc(r.nombreCli)}${r.cedulaCli ? ' · ' + esc(r.cedulaCli) : ''}</div></div></div>
    ${pie}</div>`;
  const hojas = [p1];
  for (let i = 0; i < r.fotos.length; i += 6) {
    const grupo = r.fotos.slice(i, i + 6);
    hojas.push(`<div class="pg">${cab}<div class="st">REGISTRO FOTOGRÁFICO${r.fotos.length > 6 ? ` (${i / 6 + 1})` : ''}</div>
      <div class="gal">${grupo.map(f => `<div><img src="${f.data}"><b>${f.momento === 'antes' ? 'ANTES' : 'DESPUÉS'}</b>${f.nota ? ' – ' + esc(f.nota) : ''}</div>`).join('')}</div>${pie}</div>`);
  }
  return hojas;
}
async function generarPDF(r) {
  const fin = cargando('Generando PDF…');
  const zona = $('#pdfzone');
  try {
    const hojas = hojaPDF(r);
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF({ unit: 'mm', format: 'letter' });
    for (let i = 0; i < hojas.length; i++) {
      zona.innerHTML = hojas[i];
      const el = zona.firstElementChild;
      await Promise.all([...el.querySelectorAll('img')].map(im => im.complete ? 0 : new Promise(ok => { im.onload = im.onerror = ok; })));
      const cv = await html2canvas(el, { scale: 2, backgroundColor: '#ffffff', logging: false });
      if (i) pdf.addPage();
      const W = 215.9, H = 279.4; const h = cv.height * W / cv.width;
      pdf.addImage(cv.toDataURL('image/jpeg', 0.9), 'JPEG', 0, 0, W, Math.min(h, H));
    }
    const c = cli(r.clienteId);
    const nombre = `Reporte_${r.numero}_${(nomCli(c) || 'cliente').replace(/[^\wáéíóúñÁÉÍÓÚÑ-]+/g, '_')}_${r.fecha}.pdf`;
    const blob = pdf.output('blob');
    fin();
    ventanaPDF(blob, nombre);
  } catch (e) { fin(); toast('No se pudo generar el PDF: ' + e.message); console.error(e); }
  finally { zona.innerHTML = ''; }
}
function ventanaPDF(blob, nombre) {
  const file = new File([blob], nombre, { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const puedeCompartir = navigator.canShare && navigator.canShare({ files: [file] });
  const m = ventana(`<h3>PDF listo</h3><p class="muted">${esc(nombre)}</p>
    <div class="acts" style="flex-direction:column">
    ${puedeCompartir ? '<button class="btn" data-sh>Compartir (WhatsApp, correo…)</button>' : ''}
    <a class="btn sec" style="text-align:center;text-decoration:none" href="${url}" download="${esc(nombre)}">Descargar al celular</a>
    <a class="btn sec" style="text-align:center;text-decoration:none" href="${url}" target="_blank" rel="noopener">Ver PDF</a>
    <button class="btn sec" data-x>Cerrar</button></div>`);
  const sh = m.querySelector('[data-sh]');
  if (sh) sh.onclick = async () => { try { await navigator.share({ files: [file], title: nombre }); } catch (e) { if (e.name !== 'AbortError') toast('No se pudo compartir; use Descargar'); } };
  m.querySelector('[data-x]').onclick = () => m.remove();
}

// ---------- Respaldo y exportación ----------
function descargar(blob, nombre) {
  const file = new File([blob], nombre, { type: blob.type });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    navigator.share({ files: [file], title: nombre }).catch(e => { if (e.name !== 'AbortError') bajar(); });
  } else bajar();
  function bajar() { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = nombre; document.body.appendChild(a); a.click(); a.remove(); }
}
function exportarRespaldo() {
  const datos = { app: 'reportes-flassservic', version: 1, fecha: new Date().toISOString(), maestro: M, reportes: R };
  descargar(new Blob([JSON.stringify(datos)], { type: 'application/json' }), `Respaldo_Reportes_${hoy()}.json`);
}
async function importarRespaldo(e) {
  const f = e.target.files[0]; e.target.value = ''; if (!f) return;
  try {
    const d = JSON.parse(await f.text());
    if (d.app !== 'reportes-flassservic') throw new Error('El archivo no es una copia de esta app');
    if (!await confirmar('Restaurar copia', `Se reemplazarán los datos actuales por la copia del ${d.fecha.slice(0, 10)} (${d.reportes.length} reportes).`, 'Restaurar', true)) return;
    M = d.maestro; await guardarM();
    await tx('reportes', 'readwrite', s => s.clear());
    for (const r of d.reportes) await repGuardar(r);
    R = d.reportes; toast('Copia restaurada'); pintar();
  } catch (err) { toast('Error: ' + err.message); }
}
function exportarCSV() {
  const cols = ['N°', 'Fecha', 'Estado', 'Sede', 'Cliente', 'Servicio', 'Área', 'Inventario', 'Tipo', 'Marca', 'Modelo', 'Serie', 'Repuestos', 'Observaciones'];
  const filas = R.slice().sort((a, b) => a.numero - b.numero).map(r => {
    const c = cli(r.clienteId) || {};
    return [r.numero, r.fecha, r.estado, sede(c.sedeId)?.nombre, c.nombre || c.tipo, r.servicio.join(' / '), r.area, r.inventario, r.equipo.tipo, r.equipo.marca, r.equipo.modelo, r.equipo.serie, r.repuestos, r.observaciones];
  });
  const csv = '﻿' + [cols, ...filas].map(f => f.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(';')).join('\r\n');
  descargar(new Blob([csv], { type: 'text/csv' }), `Listado_Reportes_${hoy()}.csv`);
}

// ---------- Arranque ----------
(async function () {
  try {
    idb = await abrirDB();
    M = await kvGet('maestro');
    if (!M) { M = datosIniciales(); await guardarM(); }
    R = (await repTodos()) || [];
    if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
  } catch (e) {
    $('#app').innerHTML = `<div class="empty">No se pudo abrir el almacenamiento del celular.<br>${esc(e.message)}</div>`; return;
  }
  pila = [{ pantalla: sessionStorage.getItem('ses') ? 'inicio' : 'login', args: {} }];
  history.replaceState({ n: 1 }, ''); history.pushState({ n: 1 }, '');
  pintar();
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('sw.js').catch(() => {});
  // Guardar si la app se cierra o se pasa a segundo plano
  document.addEventListener('visibilitychange', () => { if (document.hidden && repActual && repActual.args._sucio) guardarReporteActual(true); });
})();
