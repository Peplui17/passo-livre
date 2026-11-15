const API = 'http://localhost:3000/api';

let map;
let markers = [];
let token = localStorage.getItem('token') || null;
let user = JSON.parse(localStorage.getItem('user') || 'null');
let mode = null; // Pode ser 'report' ou 'route'
let routePoints = []; // Armazena os cliques para traçar rota

const el = (id) => document.getElementById(id);
const modal = el('modal'), modalBody = el('modalBody');

// ==========================================
// FUNÇÕES AUXILIARES (MODAL E AUTH)
// ==========================================
function openModal(html) {
  modalBody.innerHTML = html;
  modal.classList.remove('hidden');
}

function closeModal() {
  modal.classList.add('hidden');
  mode = null;
  routePoints = [];
  updateHint();
  if (window.routeLayer) {
    map.removeLayer(window.routeLayer);
    window.routeLayer = null;
  }
}

el('closeModal').onclick = closeModal;

function updateHint() {
  const hints = {
    null: '',
    report: 'Clique no mapa para marcar o obstáculo.',
    route: routePoints.length === 0 ? 'Clique na origem da rota.' : 'Clique no destino da rota.'
  };
  el('hint').textContent = hints[mode] || '';
  el('hint').style.display = hints[mode] ? 'block' : 'none';
}

function authHeaders() {
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function saveAuth(data) {
  token = data.token;
  user = data.user;
  localStorage.setItem('token', token);
  localStorage.setItem('user', JSON.stringify(user));
  renderAuthButton();
  closeModal();
}

function renderAuthButton() {
  el('authBtn').textContent = user ? `Sair (${user.name.split(' ')[0]})` : 'Entrar';
}

// ==========================================
// LOGIN E CADASTRO
// ==========================================
el('authBtn').onclick = () => {
  if (user) {
    token = null; user = null;
    localStorage.removeItem('token'); localStorage.removeItem('user');
    renderAuthButton();
    alert('Você saiu da conta.');
    return;
  }

  openModal(`
    <h3>Entrar / Cadastrar</h3>
    <label>Nome (apenas para cadastro)</label><input id="fName" />
    <label>E-mail</label><input id="fEmail" type="email" />
    <label>Senha</label><input id="fPass" type="password" />
    <label>Perfil de mobilidade</label>
    <select id="fProfile">
      <option value="general">Geral</option>
      <option value="wheelchair">Cadeira de rodas</option>
      <option value="walker">Andador</option>
      <option value="crutches">Muletas</option>
      <option value="stroller">Carrinho de bebê</option>
      <option value="elderly">Idoso</option>
    </select>
    <button class="primary" id="loginBtn">Entrar</button>
    <button class="secondary" id="registerBtn">Cadastrar</button>
  `);

  el('loginBtn').onclick = async () => {
    const r = await fetch(`${API}/auth/login`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: el('fEmail').value, password: el('fPass').value })
    });
    const data = await r.json();
    if (data.token) saveAuth(data); else alert(data.error);
  };

  el('registerBtn').onclick = async () => {
    const r = await fetch(`${API}/auth/register`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: el('fName').value, email: el('fEmail').value,
        password: el('fPass').value, mobility_profile: el('fProfile').value
      })
    });
    const data = await r.json();
    if (data.token) saveAuth(data); else alert(data.error);
  };
};

// ==========================================
// MAPA E REPORTES
// ==========================================
const colors = { 1: '#2e7d32', 2: '#7cb342', 3: '#f9a825', 4: '#ef6c00', 5: '#c62828' };

function initMap() {
  map = L.map('map').setView([-23.5505, -46.6333], 15);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap'
  }).addTo(map);

  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(
      (pos) => { map.setView([pos.coords.latitude, pos.coords.longitude], 16); loadReports(); },
      () => loadReports()
    );
  } else loadReports();

  map.on('click', onMapClick);
}

async function loadReports() {
  const c = map.getCenter();
  const r = await fetch(`${API}/reports/nearby?lat=${c.lat}&lng=${c.lng}&radius=5000`);
  const list = await r.json();
  
  markers.forEach(m => map.removeLayer(m));
  markers = list.map(rep => {
    const color = colors[rep.severity] || '#666';
    const marker = L.circleMarker([rep.lat, rep.lng], {
      radius: 8, color: '#fff', weight: 1, fillColor: color, fillOpacity: 0.9
    }).addTo(map);

    marker.bindPopup(`
      <strong>${rep.obstacle_type}</strong><br/>
      Severidade: ${rep.severity}/5 · Status: ${rep.status}<br/>
      ${rep.description || ''}<br/><br/>
      <button onclick="verifyReport(${rep.id}, true)" style="cursor:pointer; background:#0b5c3e; color:#fff; border:none; padding:4px 8px; border-radius:4px;">Confirmar</button>
      <button onclick="verifyReport(${rep.id}, false)" style="cursor:pointer; background:#c62828; color:#fff; border:none; padding:4px 8px; border-radius:4px; margin-left:4px;">Contestar</button>
    `);
    return marker;
  });
}

async function verifyReport(id, confirmed) {
  if (!token) return alert('Faça login para verificar.');
  const r = await fetch(`${API}/reports/${id}/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ confirmed })
  });
  const data = await r.json();
  if (r.ok) {
    alert(`Voto registrado! O status atual é: ${data.report.status}`);
    loadReports();
    map.closePopup();
  } else {
    alert(data.error);
  }
}
window.verifyReport = verifyReport;

// ==========================================
// AÇÕES DO TOOLBAR (REPORTAR E ROTEAR)
// ==========================================
el('addReportBtn').onclick = () => {
  if (!token) return alert('Faça login para reportar.');
  mode = 'report'; updateHint();
};

el('routeBtn').onclick = () => {
  routePoints = [];
  mode = 'route'; updateHint();
  if (window.routeLayer) { map.removeLayer(window.routeLayer); window.routeLayer = null; }
};

function onMapClick(e) {
  if (mode === 'report') {
    const { lat, lng } = e.latlng;
    openModal(`
      <h3>Novo reporte</h3>
      <label>Tipo de obstáculo</label>
      <select id="rType">
        <option value="irregular_sidewalk">Calçada irregular</option>
        <option value="missing_ramp">Rampa ausente</option>
        <option value="pothole">Buraco</option>
        <option value="poor_lighting">Iluminação precária</option>
        <option value="obstruction">Obstrução</option>
        <option value="steep_slope">Inclinação acentuada</option>
      </select>
      <label>Severidade (1 a 5)</label>
      <input id="rSev" type="number" min="1" max="5" value="3" />
      <label>Descrição</label>
      <textarea id="rDesc" rows="3" placeholder="Descreva o problema..."></textarea>
      <button class="primary" id="saveReport">Salvar Reporte</button>
    `);
    
    el('saveReport').onclick = async () => {
      const r = await fetch(`${API}/reports`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({
          obstacle_type: el('rType').value,
          severity: Number(el('rSev').value),
          description: el('rDesc').value,
          lat, lng
        })
      });
      if (r.ok) { closeModal(); loadReports(); } 
      else alert('Erro ao salvar reporte.');
    };
    mode = null; updateHint();
    return;
  }

  if (mode === 'route') {
    routePoints.push([e.latlng.lat, e.latlng.lng]);
    L.circleMarker(e.latlng, { radius: 6, color: '#0b5c3e', fillColor: '#0b5c3e', fillOpacity: 1 }).addTo(map);
    updateHint();
    
    if (routePoints.length === 2) {
      const [a, b] = routePoints;
      mode = null; updateHint();
      calculateRoute(a, b);
    }
  }
}

// ==========================================
// CÁLCULO DE ROTA (Integração com OSRM e API de Score)
// ==========================================
async function calculateRoute(a, b) {
  openModal('<h3>Calculando rota...</h3><p>Aguarde...</p>');
  
  // 1. Pega a geometria da rota no OSRM (Servidor público de rotas)
  const url = `https://router.project-osrm.org/route/v1/driving/${a[1]},${a[0]};${b[1]},${b[0]}?overview=full&geometries=geojson`;
  const osrm = await fetch(url).then(r => r.json()).catch(() => null);
  
  let coords = [a, b];
  if (osrm && osrm.routes && osrm.routes[0]) {
    coords = osrm.routes[0].geometry.coordinates.map(([lng, lat]) => [lat, lng]);
  }

  // Desenha a linha no mapa
  if (window.routeLayer) map.removeLayer(window.routeLayer);
  window.routeLayer = L.polyline(coords, { color: '#0b5c3e', weight: 5 }).addTo(map);
  map.fitBounds(window.routeLayer.getBounds(), { padding: [20, 20] });

  // 2. Envia para a nossa API calcular o Score de Acessibilidade
  const profile = user?.mobility_profile || 'general';
  const r = await fetch(`${API}/routes/score`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ waypoints: coords, mobility_profile: profile })
  });
  const data = await r.json();

  // 3. Mostra o resultado no Modal
  const cls = data.score >= 75 ? '#2e7d32' : data.score >= 45 ? '#f9a825' : '#c62828';
  openModal(`
    <h3>Resultado da Rota</h3>
    <div style="background:${cls}; color:#fff; padding:10px; border-radius:8px; text-align:center; margin-bottom:15px;">
      <h2 style="margin:0;">Score: ${data.score}/100</h2>
      <p style="margin:5px 0 0;">${data.message}</p>
    </div>
    <p><strong>Distância:</strong> ${(data.distance_m / 1000).toFixed(2)} km</p>
    <p><strong>Obstáculos no caminho:</strong> ${data.reports_nearby.length}</p>
    <ul>
      ${data.reports_nearby.slice(0, 5).map(o => `<li>${o.obstacle_type} (Sev. ${o.severity})</li>`).join('')}
    </ul>
    <button class="primary" onclick="document.getElementById('closeModal').click()">Fechar</button>
  `);
}

// ==========================================
// NAVEGAÇÃO E ESTATÍSTICAS
// ==========================================
document.querySelectorAll('nav [data-view]').forEach(btn => {
  btn.onclick = () => {
    document.querySelectorAll('nav button').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    
    btn.classList.add('active');
    el(`${btn.dataset.view}View`).classList.add('active');

    if (btn.dataset.view === 'stats') loadStats();
    if (btn.dataset.view === 'map' && map) setTimeout(() => map.invalidateSize(), 50);
  };
});

async function loadStats() {
  el('statsContent').innerHTML = 'Buscando dados do servidor...';
  const r = await fetch(`${API}/stats`);
  const d = await r.json();
  
  el('statsContent').innerHTML = `
    <div style="background:#e8f5e9; padding:15px; border-radius:8px; margin-bottom:20px;">
      <p style="margin:0; font-size:1.1rem;">
        <strong>Total de reportes:</strong> ${d.totals.total_reports} <br/>
        <strong>Usuários ativos:</strong> ${d.totals.active_users} <br/>
        <strong>Severidade média:</strong> ${d.totals.avg_severity || 0}
      </p>
    </div>

    <h3>Obstáculos por Tipo</h3>
    <table style="width:100%; border-collapse:collapse; margin-bottom:20px; text-align:left;">
      <tr style="background:#0b5c3e; color:#fff;">
        <th style="padding:8px;">Tipo</th><th style="padding:8px;">Qtd</th><th style="padding:8px;">Sev. Média</th>
      </tr>
      ${d.byType.map(x => `<tr style="border-bottom:1px solid #ddd;"><td style="padding:8px;">${x.obstacle_type}</td><td style="padding:8px;">${x.count}</td><td style="padding:8px;">${x.avg_severity}</td></tr>`).join('')}
    </table>

    <h3>Status dos Reportes</h3>
    <table style="width:100%; border-collapse:collapse; margin-bottom:20px; text-align:left;">
      <tr style="background:#0b5c3e; color:#fff;">
        <th style="padding:8px;">Status</th><th style="padding:8px;">Qtd</th>
      </tr>
      ${d.byStatus.map(x => `<tr style="border-bottom:1px solid #ddd;"><td style="padding:8px;">${x.status}</td><td style="padding:8px;">${x.count}</td></tr>`).join('')}
    </table>
  `;
}

// ==========================================
// BOOT
// ==========================================
initMap();
renderAuthButton();
updateHint();

// Registro do Service Worker (PWA)
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch((err) => {
    console.log('Service Worker falhou (normal se estiver em file://)', err);
  });
}