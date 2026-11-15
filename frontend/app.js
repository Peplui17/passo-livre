const API = 'http://localhost:3000/api';

let map;
let markers = [];
let token = localStorage.getItem('token') || null;
let user = JSON.parse(localStorage.getItem('user') || 'null');
let mode = null; 
let routePoints = []; 
let selectedSeverity = 3; // Variável para o seletor visual

const el = (id) => document.getElementById(id);
const modal = el('modal'), modalBody = el('modalBody');

// ==========================================
// FUNÇÕES AUXILIARES
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
    <label>Nome (apenas cadastro)</label><input id="fName" />
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
  map = L.map('map', { zoomControl: false }).setView([-23.5505, -46.6333], 15);
  // Tiles mais limpos (estilo do mockup)
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
      radius: 8, color: '#fff', weight: 2, fillColor: color, fillOpacity: 1
    }).addTo(map);

    marker.bindPopup(`
      <div style="font-family: 'Inter', sans-serif;">
        <strong style="font-size:1.1rem; color:#333;">${rep.obstacle_type}</strong><br/>
        <span style="color:#666; font-size:0.85rem;">Severidade: ${rep.severity}/5 · ${rep.status}</span><br/><br/>
        <p style="margin:0 0 10px 0; font-size:0.9rem;">${rep.description || 'Sem descrição.'}</p>
        <button onclick="verifyReport(${rep.id}, true)" style="cursor:pointer; background:#0b5c3e; color:#fff; border:none; padding:6px 12px; border-radius:6px; font-weight:600;">Confirmar</button>
        <button onclick="verifyReport(${rep.id}, false)" style="cursor:pointer; background:#fff; color:#c62828; border:1px solid #c62828; padding:6px 12px; border-radius:6px; font-weight:600; margin-left:4px;">Contestar</button>
      </div>
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
// AÇÕES DO TOOLBAR
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
    selectedSeverity = 3;
    
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
      
      <label>Severidade</label>
      <div class="severity-container" id="sevBox">
        <button class="severity-btn" data-val="1">1</button>
        <button class="severity-btn" data-val="2">2</button>
        <button class="severity-btn active" data-val="3">3</button>
        <button class="severity-btn" data-val="4">4</button>
        <button class="severity-btn" data-val="5">5</button>
      </div>

      <label>Descrição</label>
      <textarea id="rDesc" rows="3" placeholder="Descreva o problema..."></textarea>
      <button class="primary" id="saveReport">Salvar Reporte</button>
    `);
    
    // Lógica dos botões de severidade visual
    document.querySelectorAll('.severity-btn').forEach(btn => {
      btn.onclick = () => {
        document.querySelectorAll('.severity-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        selectedSeverity = Number(btn.dataset.val);
      };
    });

    el('saveReport').onclick = async () => {
      const r = await fetch(`${API}/reports`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({
          obstacle_type: el('rType').value,
          severity: selectedSeverity,
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
// CÁLCULO DE ROTA E SCORE (Estilo Mockup 3)
// ==========================================
async function calculateRoute(a, b) {
  openModal('<h3 style="text-align:center;">Calculando rota...</h3><p style="text-align:center; color:#666;">Aguarde...</p>');
  
  const url = `https://router.project-osrm.org/route/v1/driving/${a[1]},${a[0]};${b[1]},${b[0]}?overview=full&geometries=geojson`;
  const osrm = await fetch(url).then(r => r.json()).catch(() => null);
  
  let coords = [a, b];
  if (osrm && osrm.routes && osrm.routes[0]) {
    coords = osrm.routes[0].geometry.coordinates.map(([lng, lat]) => [lat, lng]);
  }

  if (window.routeLayer) map.removeLayer(window.routeLayer);
  window.routeLayer = L.polyline(coords, { color: '#0b5c3e', weight: 5 }).addTo(map);
  map.fitBounds(window.routeLayer.getBounds(), { padding: [20, 20] });

  const profile = user?.mobility_profile || 'general';
  const r = await fetch(`${API}/routes/score`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ waypoints: coords, mobility_profile: profile })
  });
  const data = await r.json();

  const scoreColor = data.score >= 75 ? '#2e7d32' : data.score >= 45 ? '#f9a825' : '#c62828';
  
  openModal(`
    <h3 style="text-align:center; margin-bottom:0;">Resultado da rota</h3>
    <div class="score-ring-container">
      <div class="score-ring" style="background: conic-gradient(${scoreColor} ${data.score}%, #eee 0);">
        <div class="score-text">
          <h2>${data.score}</h2>
          <p>/100</p>
        </div>
      </div>
    </div>
    <p style="text-align:center; color:${scoreColor}; font-weight:600; margin-bottom:20px;">${data.message}</p>
    
    <div style="display:flex; gap:10px; margin-bottom: 20px;">
      <div class="stat-box" style="flex:1; padding:12px;"><h4>${(data.distance_m / 1000).toFixed(2)}km</h4><p>Distância</p></div>
      <div class="stat-box" style="flex:1; padding:12px;"><h4>${data.reports_nearby.length}</h4><p>Obstáculos</p></div>
    </div>

    <div style="background:#f8f9fa; padding:16px; border-radius:12px; margin-bottom:20px;">
      <h4 style="font-size:0.8rem; color:#666; margin-bottom:10px; text-transform:uppercase;">Obstáculos no trajeto</h4>
      <ul style="padding-left:20px; color:#333; font-size:0.9rem;">
        ${data.reports_nearby.slice(0, 5).map(o => `<li style="margin-bottom:4px;">${o.obstacle_type} <span style="color:#c62828;">(Sev. ${o.severity})</span></li>`).join('')}
        ${data.reports_nearby.length === 0 ? '<li>Nenhum obstáculo encontrado!</li>' : ''}
      </ul>
    </div>

    <button class="primary" onclick="document.getElementById('closeModal').click()">Fechar</button>
  `);
}

// ==========================================
// NAVEGAÇÃO E ESTATÍSTICAS (Estilo Mockup 4)
// ==========================================
document.querySelectorAll('.bottom-nav [data-view]').forEach(btn => {
  btn.onclick = () => {
    document.querySelectorAll('.bottom-nav button').forEach(b => b.classList.remove('active'));
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
  
  // Função que gera as barras coloridas do mockup
  const makeBar = (label, count, max, color) => `
    <div class="bar-row">
      <div class="bar-label">${label.replace('_', ' ')}</div>
      <div class="bar-track"><div class="bar-fill" style="width:${(count/max)*100}%; background:${color};"></div></div>
      <div class="bar-value">${count}</div>
    </div>
  `;

  const maxType = Math.max(...d.byType.map(x => x.count), 1);
  const maxSev = Math.max(...d.bySeverity.map(x => x.count), 1);
  
  el('statsContent').innerHTML = `
    <div class="stats-grid">
      <div class="stat-box"><h4>${d.totals.total_reports}</h4><p>Reportes</p></div>
      <div class="stat-box"><h4>${d.totals.active_users}</h4><p>Usuários</p></div>
      <div class="stat-box"><h4>${d.totals.avg_severity || 0}</h4><p>Sev. Média</p></div>
    </div>

    <div class="stats-card">
      <h4 style="margin-bottom:16px; font-size:0.85rem; color:#666; text-transform:uppercase;">Por Tipo de Obstáculo</h4>
      ${d.byType.map(x => makeBar(x.obstacle_type, x.count, maxType, '#0b5c3e')).join('')}
    </div>

    <div class="stats-card">
      <h4 style="margin-bottom:16px; font-size:0.85rem; color:#666; text-transform:uppercase;">Por Severidade</h4>
      ${d.bySeverity.map(x => makeBar(`Nível ${x.severity}`, x.count, maxSev, colors[x.severity])).join('')}
    </div>

    <div class="stats-card">
      <h4 style="margin-bottom:16px; font-size:0.85rem; color:#666; text-transform:uppercase;">Status dos Reportes</h4>
      ${d.byStatus.map(x => makeBar(x.status, x.count, d.totals.total_reports, '#666')).join('')}
    </div>
  `;
}

// ==========================================
// BOOT
// ==========================================
initMap();
renderAuthButton();
updateHint();

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch((err) => {
    console.log('Service Worker falhou', err);
  });
}