// app.js

const SUPABASE_URL = "https://jaoirokvofscundirnzk.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imphb2lyb2t2b2ZzY3VuZGlybnprIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUwNzU3NzMsImV4cCI6MjA5MDY1MTc3M30.U1NsVWh3ephcLjh8LGVVwQrAiEZJFt_BLiZYABgZmBY";
const _sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

const SESSION_DURATION = 15 * 60 * 1000;

// GUARD, detiene TODO el script si no hay sesión válida
function requireSession() {
  const key   = sessionStorage.getItem('masterKey');
  const start = sessionStorage.getItem('sessionStart');

  if (!key || !start) {
    window.location.replace('pass.html');
    throw new Error('Sin sesión.');
  }
  if (Date.now() - parseInt(start) >= SESSION_DURATION) {
    sessionStorage.clear();
    window.location.replace('pass.html');
    throw new Error('Sesión expirada.');
  }
}

requireSession();

// INIT
const MASTER_KEY = sessionStorage.getItem('masterKey');
const adminUser  = sessionStorage.getItem('adminUser') || 'admin';

const navUser = document.getElementById('nav-user');
if (navUser) navUser.textContent = adminUser;

// TIMER DE SESIÓN
let sessionInterval;

function startSessionTimer() {
  const timerEl = document.getElementById('session-timer');
  const barEl   = document.getElementById('timer-bar');

  sessionInterval = setInterval(() => {
    const start     = parseInt(sessionStorage.getItem('sessionStart'));
    const remaining = SESSION_DURATION - (Date.now() - start);

    if (remaining <= 0) { logout(); return; }

    const mins = Math.floor(remaining / 60000);
    const secs = Math.floor((remaining % 60000) / 1000);
    timerEl.textContent = `${String(mins).padStart(2,'0')}:${String(secs).padStart(2,'0')}`;
    timerEl.classList.toggle('warning', remaining < 2 * 60 * 1000);

    const pct = (remaining / SESSION_DURATION) * 100;
    barEl.style.width = pct + '%';
    barEl.style.background = remaining < 2 * 60 * 1000
      ? 'rgba(184,58,42,0.6)'
      : 'rgba(196,120,138,0.5)';
  }, 1000);
}

startSessionTimer();

// LOGOUT
function logout() {
  clearInterval(sessionInterval);
  sessionStorage.clear();
  window.location.replace('pass.html');
}

// CIFRADO AES-256
function encrypt(text) { return CryptoJS.AES.encrypt(text, MASTER_KEY).toString(); }

function decrypt(hash) {
  try {
    const bytes = CryptoJS.AES.decrypt(hash, MASTER_KEY);
    return bytes.toString(CryptoJS.enc.Utf8) || '[error al descifrar]';
  } catch { return '[error al descifrar]'; }
}

// MENSAJES UI
function setMsg(elId, text, type = 'error') {
  const el = document.getElementById(elId);
  if (!el) return;
  el.textContent = text;
  el.className = `msg ${type}`;
  if (type !== 'error') setTimeout(() => { el.className = 'msg'; el.textContent = ''; }, 3000);
}

function showToast(text = 'Copiado al portapapeles') {
  const t = document.getElementById('toast');
  t.textContent = text;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2000);
}

// DATOS
let allCredentials = [];

// GUARDAR
async function saveCredential() {
  const site  = document.getElementById('inp-site').value.trim();
  const user  = document.getElementById('inp-user').value.trim();
  const pass  = document.getElementById('inp-pass').value;
  const notes = document.getElementById('inp-notes').value.trim();

  if (!site || !pass) { setMsg('add-msg', 'El servicio y la contraseña son obligatorios.', 'error'); return; }

  try {
    const { error } = await _sb.rpc('insert_credential', {
      p_site: site, p_username: user, p_hash: encrypt(pass), p_notes: notes || null
    });
    if (error) throw error;
    setMsg('add-msg', '¡Credencial guardada de forma segura!', 'success');
    document.getElementById('inp-site').value  = '';
    document.getElementById('inp-user').value  = '';
    document.getElementById('inp-pass').value  = '';
    document.getElementById('inp-notes').value = '';
    await fetchCredentials();
  } catch (err) {
    console.error(err);
    setMsg('add-msg', 'Error al guardar. Revisa la conexión.', 'error');
  }
}

// OBTENER
async function fetchCredentials() {
  try {
    const { data, error } = await _sb.rpc('get_credentials');
    if (error) throw error;
    allCredentials = data || [];
    renderCredentials(allCredentials);
  } catch (err) { console.error(err); }
}

// ELIMINAR
async function deleteCredential(id) {
  if (!confirm('¿Eliminar esta credencial permanentemente?')) return;
  try {
    const { error } = await _sb.rpc('delete_credential', { p_id: id });
    if (error) throw error;
    allCredentials = allCredentials.filter(c => c.id !== id);
    filterCredentials();
    showToast('Credencial eliminada');
  } catch (err) { console.error(err); alert('Error al eliminar.'); }
}

// FILTRAR
function filterCredentials() {
  const query = document.getElementById('search-input').value.toLowerCase().trim();
  renderCredentials(query
    ? allCredentials.filter(c =>
        c.site_name.toLowerCase().includes(query) ||
        (c.username || '').toLowerCase().includes(query) ||
        (c.notes || '').toLowerCase().includes(query))
    : allCredentials
  );
}

// RENDERIZAR
function renderCredentials(list) {
  const container = document.getElementById('credentials-grid');
  const countEl   = document.getElementById('cred-count');

  container.innerHTML = '';
  countEl.textContent = `${list.length} ${list.length === 1 ? 'registro' : 'registros'}`;

  if (list.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.innerHTML = '<div class="empty-state-icon">🔒</div><p class="empty-state-text">La bóveda está vacía</p>';
    container.appendChild(empty);
    return;
  }

  list.forEach((item, index) => {
    const decryptedPass = decrypt(item.password_hash);
    const date = new Date(item.created_at).toLocaleDateString('es-ES', {
      day: '2-digit', month: 'short', year: 'numeric'
    });

    const card = document.createElement('div');
    card.className = 'credential-card fade-in';
    card.style.animationDelay = `${index * 0.05}s`;

    const btnDelete = document.createElement('button');
    btnDelete.className = 'btn-delete';
    btnDelete.textContent = '✕';
    btnDelete.title = 'Eliminar';
    btnDelete.onclick = () => deleteCredential(item.id);

    const site = document.createElement('div');
    site.className = 'credential-site';
    site.textContent = item.site_name;

    const user = document.createElement('div');
    user.className = 'credential-user';
    user.textContent = item.username || '—';

    // Notas (solo se muestra si hay contenido)
    if (item.notes) {
      const notesEl = document.createElement('div');
      notesEl.className = 'credential-notes';
      notesEl.textContent = item.notes;
      card.appendChild(btnDelete);
      card.appendChild(site);
      card.appendChild(user);
      card.appendChild(notesEl);
    } else {
      card.appendChild(btnDelete);
      card.appendChild(site);
      card.appendChild(user);
    }

    const dateEl = document.createElement('div');
    dateEl.className = 'credential-date';
    dateEl.textContent = `Añadido: ${date}`;

    const passDisplay = document.createElement('div');
    passDisplay.className = 'password-display';

    const passText = document.createElement('span');
    passText.className = 'password-text';
    passText.textContent = '••••••••';

    const btnShow = document.createElement('button');
    btnShow.className = 'btn-show';
    btnShow.textContent = 'VER';
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
    card.appendChild(dateEl);
    card.appendChild(passDisplay);
    container.appendChild(card);
  });
}

// TOGGLE PASS
function togglePass(textEl, btn, plainPass) {
  const isHidden = textEl.textContent === '••••••••';
  textEl.textContent = isHidden ? plainPass : '••••••••';
  btn.textContent    = isHidden ? 'OCULTAR' : 'VER';
}

// ENTER
document.addEventListener('keydown', e => {
  if (e.key === 'Enter' && document.activeElement.id.startsWith('inp-')) saveCredential();
});

fetchCredentials();