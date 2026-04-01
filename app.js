// app.js

// CONFIG SUPABASE
const SUPABASE_URL = "TU_URL_DE_SUPABASE";
const SUPABASE_KEY = "TU_ANON_KEY_DE_SUPABASE";
const _sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// SESIÓN
const SESSION_DURATION = 15 * 60 * 1000; // 15 minutos en ms

// Verificar que existe sesión válida al cargar
(function guardSession() {
  const key   = sessionStorage.getItem('masterKey');
  const start = sessionStorage.getItem('sessionStart');

  if (!key || !start) {
    window.location.href = 'login.html';
    return;
  }

  const elapsed = Date.now() - parseInt(start);
  if (elapsed >= SESSION_DURATION) {
    logout();
  }
})();

// Master key de la sesión (nunca hardcodeada, viene del login)
const MASTER_KEY = sessionStorage.getItem('masterKey');

// Mostrar usuario en navbar
const adminUser = sessionStorage.getItem('adminUser') || 'admin';
const navUser = document.getElementById('nav-user');
if (navUser) navUser.textContent = adminUser;

// TIMER DE SESIÓN
let sessionInterval;

function startSessionTimer() {
  const timerEl = document.getElementById('session-timer');
  const barEl   = document.getElementById('timer-bar');

  sessionInterval = setInterval(() => {
    const start   = parseInt(sessionStorage.getItem('sessionStart'));
    const elapsed = Date.now() - start;
    const remaining = SESSION_DURATION - elapsed;

    if (remaining <= 0) {
      logout();
      return;
    }

    // Actualizar texto
    const mins = Math.floor(remaining / 60000);
    const secs = Math.floor((remaining % 60000) / 1000);
    timerEl.textContent = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;

    // Advertencia cuando quedan 2 minutos
    timerEl.classList.toggle('warning', remaining < 2 * 60 * 1000);

    // Barra de progreso
    const pct = (remaining / SESSION_DURATION) * 100;
    barEl.style.width = pct + '%';
    barEl.style.background = remaining < 2 * 60 * 1000
      ? 'rgba(192,68,42,0.7)'
      : 'rgba(180,140,40,0.5)';

  }, 1000);
}

startSessionTimer();

// LOGOUT
function logout() {
  clearInterval(sessionInterval);
  sessionStorage.clear();
  window.location.href = 'login.html';
}

// CIFRADO AES-256
function encrypt(text) {
  return CryptoJS.AES.encrypt(text, MASTER_KEY).toString();
}

function decrypt(hash) {
  try {
    const bytes = CryptoJS.AES.decrypt(hash, MASTER_KEY);
    return bytes.toString(CryptoJS.enc.Utf8) || '[error al descifrar]';
  } catch {
    return '[error al descifrar]';
  }
}

// MENSAJES UI
function setMsg(elId, text, type = 'error') {
  const el = document.getElementById(elId);
  if (!el) return;
  el.textContent = text;
  el.className = `msg ${type}`;
  if (type !== 'error') {
    setTimeout(() => { el.className = 'msg'; el.textContent = ''; }, 3000);
  }
}

// Toast de copiado
function showToast(text = 'Copiado al portapapeles') {
  const t = document.getElementById('toast');
  t.textContent = text;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2000);
}

// DATOS EN MEMORIA
let allCredentials = []; // Cache local para filtrado sin re-fetch

// GUARDAR CREDENCIAL
async function saveCredential() {
  const site = document.getElementById('inp-site').value.trim();
  const user = document.getElementById('inp-user').value.trim();
  const pass = document.getElementById('inp-pass').value;

  if (!site || !pass) {
    setMsg('add-msg', 'El servicio y la contraseña son obligatorios.', 'error');
    return;
  }

  const encryptedPass = encrypt(pass);

  try {
    const { error } = await _sb.rpc('insert_credential', {
      p_site: site,
      p_username: user,
      p_hash: encryptedPass
    });

    if (error) throw error;

    setMsg('add-msg', '¡Credencial guardada de forma segura!', 'success');

    // Limpiar campos
    document.getElementById('inp-site').value = '';
    document.getElementById('inp-user').value = '';
    document.getElementById('inp-pass').value = '';

    // Recargar lista
    await fetchCredentials();

  } catch (err) {
    console.error(err);
    setMsg('add-msg', 'Error al guardar. Revisa la conexión.', 'error');
  }
}

// OBTENER CREDENCIALES
async function fetchCredentials() {
  try {
    const { data, error } = await _sb.rpc('get_credentials');

    if (error) throw error;

    allCredentials = data || [];
    renderCredentials(allCredentials);

  } catch (err) {
    console.error(err);
    renderEmpty('Error al cargar la bóveda.');
  }
}

// ELIMINAR CREDENCIAL
async function deleteCredential(id) {
  if (!confirm('¿Eliminar esta credencial permanentemente?')) return;

  try {
    const { error } = await _sb.rpc('delete_credential', { p_id: id });

    if (error) throw error;

    // Remover de la lista local y re-renderizar
    allCredentials = allCredentials.filter(c => c.id !== id);
    filterCredentials();
    showToast('Credencial eliminada');

  } catch (err) {
    console.error(err);
    alert('Error al eliminar. Intenta de nuevo.');
  }
}

// FILTRAR POR BÚSQUEDA
function filterCredentials() {
  const query = document.getElementById('search-input').value.toLowerCase().trim();
  const filtered = query
    ? allCredentials.filter(c =>
        c.site_name.toLowerCase().includes(query) ||
        (c.username || '').toLowerCase().includes(query)
      )
    : allCredentials;

  renderCredentials(filtered);
}

// RENDERIZAR LISTA
function renderCredentials(list) {
  const container = document.getElementById('credentials-grid');
  const countEl   = document.getElementById('cred-count');

  container.innerHTML = '';
  countEl.textContent = `${list.length} ${list.length === 1 ? 'registro' : 'registros'}`;

  if (list.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.innerHTML = `<div class="empty-state-icon">🔒</div><p class="empty-state-text">La bóveda está vacía</p>`;
    container.appendChild(empty);
    return;
  }

  list.forEach((item, index) => {
    const decryptedPass = decrypt(item.password_hash);
    const date = new Date(item.created_at).toLocaleDateString('es-ES', {
      day: '2-digit', month: 'short', year: 'numeric'
    });

    // Crear elemento de forma segura (sin innerHTML con datos externos)
    const card = document.createElement('div');
    card.className = 'credential-card fade-in';
    card.style.animationDelay = `${index * 0.05}s`;
    card.dataset.id = item.id;

    // Botón eliminar
    const btnDelete = document.createElement('button');
    btnDelete.className = 'btn-delete';
    btnDelete.textContent = '✕';
    btnDelete.title = 'Eliminar';
    btnDelete.onclick = () => deleteCredential(item.id);

    // Nombre del sitio
    const site = document.createElement('div');
    site.className = 'credential-site';
    site.textContent = item.site_name; // textContent = seguro contra XSS

    // Usuario
    const user = document.createElement('div');
    user.className = 'credential-user';
    user.textContent = item.username || '—';

    // Fecha
    const dateEl = document.createElement('div');
    dateEl.className = 'credential-date';
    dateEl.textContent = `Añadido: ${date}`;

    // Display de contraseña
    const passDisplay = document.createElement('div');
    passDisplay.className = 'password-display';

    const passText = document.createElement('span');
    passText.className = 'password-text';
    passText.textContent = '••••••••';

    const btnShow = document.createElement('button');
    btnShow.className = 'btn-show';
    btnShow.textContent = 'VER';
    // La contraseña descifrada se guarda en closure, nunca en el DOM
    btnShow.onclick = () => togglePass(passText, btnShow, decryptedPass);

    const btnCopy = document.createElement('button');
    btnCopy.className = 'btn-copy';
    btnCopy.textContent = 'COPIAR';
    btnCopy.onclick = () => {
      navigator.clipboard.writeText(decryptedPass)
        .then(() => showToast('Contraseña copiada'))
        .catch(() => showToast('No se pudo copiar'));
    };

    passDisplay.appendChild(passText);
    passDisplay.appendChild(btnShow);
    passDisplay.appendChild(btnCopy);

    card.appendChild(btnDelete);
    card.appendChild(site);
    card.appendChild(user);
    card.appendChild(dateEl);
    card.appendChild(passDisplay);

    container.appendChild(card);
  });
}

// TOGGLE MOSTRAR/OCULTAR CONTRASEÑA
function togglePass(textEl, btn, plainPass) {
  const isHidden = textEl.textContent === '••••••••';
  textEl.textContent = isHidden ? plainPass : '••••••••';
  btn.textContent = isHidden ? 'OCULTAR' : 'VER';
}

// ENTRADA CON ENTER
document.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && document.activeElement.id.startsWith('inp-')) {
    saveCredential();
  }
});

// INICIAR
fetchCredentials();