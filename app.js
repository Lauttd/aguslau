/* ═══════════════════════════════════════════════════════════
   EL PORTAL DE LA PAREJA — Agus & Lauti
   App Logic (Node.js + Socket.io + LocalStorage fallback)
   ═══════════════════════════════════════════════════════════ */

// ─── CONSTANTS ───
const ANNIVERSARY = new Date(2026, 0, 17); // January 17, 2026
const MET_DATE = new Date(2025, 8, 1);     // September 1, 2025
const PASSWORD = '17012026';               // ddmmaaaa

const CATEGORY_EMOJIS = { restaurant: '🍽️', movie: '🎬', trip: '✈️', outdoor: '🌳', activity: '🎯' };
const CATEGORY_LABELS = { restaurant: 'Restaurante', movie: 'Película', trip: 'Viaje', outdoor: 'Aire libre', activity: 'Actividad' };
const ROULETTE_COLORS = ['#ff6b9d', '#c084fc', '#60a5fa', '#fb923c', '#4ade80', '#22d3ee', '#fbbf24', '#f87171', '#a78bfa', '#34d399', '#f472b6', '#38bdf8'];

// ─── STATE ───
let currentUser = null;
let selectedLoginUser = 'agus';
let currentSection = 'dashboard';
let currentFilter = 'all';
let currentRouletteMode = 'food';
let currentCouponUser = 'agus';
let pendingRedeemId = null;
let isSpinning = false;
let wheelRotation = 0;

let socket = null;
let db = {}; // Synced from server

// ─── INIT APP ───
async function initApp() {
    checkAnniversaryMode();
    await fetchDB();
    setupSocket();

    const session = localStorage.getItem('portal_session');
    if (session) {
        currentUser = JSON.parse(session).user;
        showApp();
    } else {
        checkDailyQuote();
    }
}

// ─── SERVER COMMS ───
async function fetchDB() {
    try {
        const res = await fetch('/api/data');
        if (res.ok) {
            db = await res.json();
        }
    } catch (e) {
        console.warn('Backend not reachable. Using fallback.');
        // Fallback to minimal state if server is offline
        db = {
            plans: [], coupons: [], roulette_food: ['Hamburguesas', 'Pizza'], roulette_activity: ['Peli'],
            moods: { agus: {}, lauti: {} }, phrases: [], moto: { routes: [], km: 0, rainCount: 0 },
            achievements: [], capsule: { monthlyPhotos: [], futureMessage: null }, notes: []
        };
    }
}

async function updateDB(key, value) {
    db[key] = value;
    try {
        await fetch('/api/update', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ key, value, user: currentUser })
        });
    } catch (e) {
        console.warn('Could not save to backend.');
    }
    renderCurrentSection();
}

function setupSocket() {
    try {
        socket = io();
        socket.on('data-updated', (data) => {
            if (data.key === 'notes') {
                handleIncomingNotes(data.value);
            }
            db[data.key] = data.value;
            renderCurrentSection();
        });

        socket.on('receive-mates', (fromUser) => {
            const senderName = fromUser === 'agus' ? 'Agus' : 'Lauti';
            if (fromUser !== currentUser) {
                if (navigator.vibrate) navigator.vibrate([200, 100, 200, 100, 500]);
                document.getElementById('mates-sender').textContent = `${senderName} te está invitando 🥺`;
                document.getElementById('mates-popup').classList.remove('hidden');
            }
        });

        socket.on('partner-touch-start', (fromUser) => {
            if (fromUser !== currentUser) {
                if (isHoldingTouch) showTouchOverlay(); // If I'm holding too, we connected!
            }
        });
    } catch (e) {
        console.warn('Socket.io not loaded.');
    }
}

// ─── RENDERING ROUTER ───
function renderCurrentSection() {
    updateStats();
    updateMoodSection();
    renderPlans();
    renderRouletteOptions();
    if (!isSpinning) drawRouletteWheel();
    renderCoupons();
    renderCapsule();
    renderMoto();
    renderAchievements();
    renderPhrases();
    renderNotes();
}

// ═══════════════════════════════════════════════════════════
// LOGIN & QUOTE
// ═══════════════════════════════════════════════════════════
function selectLoginUser(user) {
    selectedLoginUser = user;
    document.querySelectorAll('.login-user-btn').forEach(btn => btn.classList.toggle('active', btn.dataset.user === user));
}

function attemptLogin() {
    const pwd = document.getElementById('login-password').value;
    const errorEl = document.getElementById('login-error');

    if (pwd !== PASSWORD) {
        errorEl.textContent = '❌ Contraseña incorrecta';
        errorEl.style.animation = 'none';
        void errorEl.offsetWidth;
        errorEl.style.animation = 'shake 0.4s ease';
        return;
    }
    currentUser = selectedLoginUser;
    localStorage.setItem('portal_session', JSON.stringify({ user: currentUser }));
    showApp();
}

function showApp() {
    document.getElementById('login-screen').classList.remove('active');
    document.getElementById('app-screen').classList.add('active');
    updateTopbar();
    updateCounter();
    setInterval(updateCounter, 60000);
    renderCurrentSection();
    setupPushNotifications();
}

function logout() {
    localStorage.removeItem('portal_session');
    currentUser = null;
    document.getElementById('app-screen').classList.remove('active');
    document.getElementById('login-screen').classList.add('active');
    document.getElementById('login-password').value = '';
    document.getElementById('login-error').textContent = '';
}

function checkDailyQuote() {
    if (!db.phrases || db.phrases.length === 0) return;
    const idx = Math.floor(Math.random() * db.phrases.length);
    const p = db.phrases[idx];
    document.getElementById('daily-quote-text').textContent = `"${p.text}"`;
    document.getElementById('daily-quote-card').classList.remove('hidden');
}

// ═══════════════════════════════════════════════════════════
// ANNIVERSARY MODE
// ═══════════════════════════════════════════════════════════
function checkAnniversaryMode() {
    const today = new Date();
    if (today.getDate() === 17) {
        document.getElementById('anniversary-overlay').classList.remove('hidden');
        spawnHearts(document.getElementById('falling-hearts'));
    }
}
function closeAnniversaryMode() {
    document.getElementById('anniversary-overlay').classList.add('hidden');
}
function spawnHearts(container) {
    for (let i = 0; i < 30; i++) {
        const heart = document.createElement('div');
        heart.textContent = ['💕','💖','💗','💝'][Math.floor(Math.random()*4)];
        heart.style.position = 'absolute';
        heart.style.left = `${Math.random() * 100}%`;
        heart.style.top = `-20px`;
        heart.style.fontSize = `${1 + Math.random() * 2}rem`;
        heart.style.animation = `confettiFall ${3 + Math.random() * 3}s linear infinite`;
        heart.style.animationDelay = `${Math.random() * 5}s`;
        container.appendChild(heart);
    }
}

// ═══════════════════════════════════════════════════════════
// NAVIGATION & TOPBAR
// ═══════════════════════════════════════════════════════════
function navigateTo(section) {
    currentSection = section;
    document.querySelectorAll('.nav-item').forEach(i => i.classList.toggle('active', i.dataset.section === section));
    document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
    
    const target = document.getElementById(`section-${section}`);
    if (target) {
        target.classList.add('active');
        target.style.animation = 'sectionEnter 0.5s cubic-bezier(0.16, 1, 0.3, 1) both';
    }

    const titles = { dashboard: '🏠 Inicio', plans: '📋 Nuestros Planes', roulette: '🎰 La Ruleta', coupons: '🎟️ Cupones de Amor', capsule: '🕰️ Cápsula del Tiempo', moto: '🏍️ Viajes en Moto', achievements: '🏆 Logros Amorosos', phrases: '📝 Frases Célebres', notes: '💌 Notitas' };
    document.getElementById('page-title').textContent = titles[section] || 'Inicio';
    
    closeSidebarMobile();
    if(section === 'roulette' && !isSpinning) drawRouletteWheel();
    if(section === 'notes') markNotesRead();
}

function toggleSidebar() {
    document.getElementById('sidebar').classList.toggle('open');
    document.getElementById('sidebar-overlay').classList.toggle('show');
}
function closeSidebarMobile() {
    document.getElementById('sidebar').classList.remove('open');
    document.getElementById('sidebar-overlay').classList.remove('show');
}
function updateTopbar() {
    const h = new Date().getHours();
    const g = h < 6 ? 'Buenas noches' : h < 12 ? 'Buen día' : h < 19 ? 'Buenas tardes' : 'Buenas noches';
    document.getElementById('topbar-user').textContent = `${g}, ${currentUser === 'agus' ? 'Agus' : 'Lauti'} 💕`;
}
function updateCounter() {
    const now = new Date();
    let y = now.getFullYear() - ANNIVERSARY.getFullYear();
    let m = now.getMonth() - ANNIVERSARY.getMonth();
    let d = now.getDate() - ANNIVERSARY.getDate();
    if (d < 0) { m--; const pm = new Date(now.getFullYear(), now.getMonth(), 0); d += pm.getDate(); }
    if (m < 0) { y--; m += 12; }
    const totalDays = Math.floor((now - ANNIVERSARY) / 86400000);
    
    document.getElementById('counter-years').textContent = y;
    document.getElementById('counter-months').textContent = m;
    document.getElementById('counter-days').textContent = d;
    document.getElementById('hero-total-days').textContent = `${totalDays.toLocaleString()} días exactos de amor 💕`;
    document.getElementById('timeline-today').textContent = `Llevamos ${totalDays} días juntos y contando... ✨`;
    const sb = document.getElementById('days-together-sidebar');
    if (sb) sb.textContent = `${totalDays} días juntos 💕`;
}

// ═══════════════════════════════════════════════════════════
// MOOD & STATS
// ═══════════════════════════════════════════════════════════
function updateMoodSection() {
    if (!db.moods) return;
    const partner = currentUser === 'agus' ? 'lauti' : 'agus';
    document.getElementById('partner-mood-avatar').textContent = partner === 'agus' ? 'A' : 'L';
    document.getElementById('partner-mood-name').textContent = partner === 'agus' ? 'Agus' : 'Lauti';
    document.getElementById('partner-mood-status').textContent = db.moods[partner]?.text || 'Sin estado';
    document.getElementById('my-mood-avatar').textContent = currentUser === 'agus' ? 'A' : 'L';
    document.getElementById('my-mood-current').textContent = db.moods[currentUser]?.text || 'Seleccioná tu estado';
}
function setMood(mood) {
    db.moods[currentUser] = { text: mood, time: new Date().toISOString() };
    updateDB('moods', db.moods);
    showToast('💭', `Estado actualizado: ${mood}`);
}
function updateStats() {
    document.getElementById('stat-plans').textContent = db.plans?.filter(p => p.status !== 'done').length || 0;
    document.getElementById('stat-coupons').textContent = db.coupons?.filter(c => !c.redeemed).length || 0;
    document.getElementById('stat-achievements').textContent = db.achievements?.filter(a => a.unlocked).length || 0;
}

// ═══════════════════════════════════════════════════════════
// PLANS
// ═══════════════════════════════════════════════════════════
function addPlan() {
    const text = document.getElementById('plan-input').value.trim();
    if (!text) return showToast('⚠️', 'Escribí un plan primero');
    const cat = document.getElementById('plan-category').value;
    
    db.plans.unshift({ id: Date.now(), text, category: cat, status: 'pending', createdAt: new Date().toISOString() });
    updateDB('plans', db.plans);
    document.getElementById('plan-input').value = '';
    showToast('✅', `Plan agregado`);
}
function movePlan(id, status) {
    const plan = db.plans.find(p => p.id === id);
    if (!plan) return;
    plan.status = status;
    if (status === 'done') {
        plan.doneAt = new Date().toISOString();
        showToast('🎉', `¡Completado!`);
        checkAchievements();
    }
    updateDB('plans', db.plans);
}
function deletePlan(id) {
    const plan = db.plans.find(p => p.id === id);
    if (!plan) return;
    document.getElementById('delete-message').textContent = `¿Eliminar "${plan.text}"?`;
    document.getElementById('delete-confirm-btn').onclick = () => {
        db.plans = db.plans.filter(p => p.id !== id);
        updateDB('plans', db.plans);
        closeModal('delete-modal');
    };
    document.getElementById('delete-modal').classList.remove('hidden');
}
function filterPlans(filter) {
    currentFilter = filter;
    document.querySelectorAll('.filter-btn').forEach(btn => btn.classList.toggle('active', btn.dataset.filter === filter));
    renderPlans();
}
function renderPlans() {
    if (!db.plans) return;
    const filtered = currentFilter === 'all' ? db.plans : db.plans.filter(p => p.category === currentFilter);
    const pending = filtered.filter(p => p.status === 'pending');
    const progress = filtered.filter(p => p.status === 'progress');
    const done = filtered.filter(p => p.status === 'done');

    renderKanbanCol('items-pending', pending, 'pending');
    renderKanbanCol('items-progress', progress, 'progress');
    renderKanbanCol('items-done', done, 'done');
    
    document.getElementById('count-pending').textContent = pending.length;
    document.getElementById('count-progress').textContent = progress.length;
    document.getElementById('count-done').textContent = done.length;
    
    const hist = document.getElementById('history-list');
    hist.innerHTML = db.plans.filter(p => p.status === 'done').sort((a,b) => new Date(b.doneAt) - new Date(a.doneAt)).map(p => `
        <div class="route-item"><span class="moto-icon" style="font-size:1.5rem;margin:0;">${CATEGORY_EMOJIS[p.category]||'📌'}</span> <div><b>${escapeHtml(p.text)}</b><br><small>${formatDate(p.doneAt)}</small></div></div>
    `).join('');
}
function renderKanbanCol(containerId, items, status) {
    const container = document.getElementById(containerId);
    if (!container) return;
    if (items.length === 0) { container.innerHTML = `<p style="text-align:center;color:var(--text-tertiary);font-size:0.8rem;padding:1rem;">Vacío</p>`; return; }
    container.innerHTML = items.map(p => `
        <div class="kanban-card ${status==='done'?'done-card':''}">
            <div class="kanban-card-top">
                <span class="kanban-card-title">${escapeHtml(p.text)}</span>
                <span class="kanban-card-category">${CATEGORY_EMOJIS[p.category]||'📌'}</span>
            </div>
            <div class="kanban-card-actions">
                ${status==='pending' ? `<button class="kanban-action-btn" onclick="movePlan(${p.id}, 'progress')">🔥</button><button class="kanban-action-btn" onclick="movePlan(${p.id}, 'done')">✅</button>` : ''}
                ${status==='progress'? `<button class="kanban-action-btn" onclick="movePlan(${p.id}, 'pending')">⬅️</button><button class="kanban-action-btn" onclick="movePlan(${p.id}, 'done')">✅</button>` : ''}
                ${status==='done'    ? `<button class="kanban-action-btn" onclick="movePlan(${p.id}, 'pending')">⬅️</button>` : ''}
                <button class="kanban-action-btn" onclick="deletePlan(${p.id})">🗑️</button>
            </div>
        </div>
    `).join('');
}
function toggleHistory() {
    document.getElementById('history-list').classList.toggle('collapsed');
    document.getElementById('history-toggle').classList.toggle('open');
}

// ═══════════════════════════════════════════════════════════
// ROULETTE
// ═══════════════════════════════════════════════════════════
function switchRouletteMode(m) {
    currentRouletteMode = m;
    document.getElementById('mode-food').classList.toggle('active', m === 'food');
    document.getElementById('mode-activity').classList.toggle('active', m === 'activity');
    document.getElementById('roulette-options-title').textContent = m === 'food' ? '🍕 Comida' : '🎬 Salidas';
    document.getElementById('roulette-result').classList.add('hidden');
    renderRouletteOptions();
    drawRouletteWheel();
}
function getRouletteOpts() { return db[`roulette_${currentRouletteMode}`] || []; }
function addRouletteOption() {
    const text = document.getElementById('roulette-input').value.trim();
    if(!text) return;
    getRouletteOpts().push(text);
    updateDB(`roulette_${currentRouletteMode}`, getRouletteOpts());
    document.getElementById('roulette-input').value = '';
}
function removeRouletteOption(idx) {
    getRouletteOpts().splice(idx, 1);
    updateDB(`roulette_${currentRouletteMode}`, getRouletteOpts());
}
function renderRouletteOptions() {
    const opts = getRouletteOpts();
    document.getElementById('roulette-list').innerHTML = opts.map((opt, i) => `
        <div class="roulette-option"><span>${escapeHtml(opt)}</span> <button class="roulette-option-remove" onclick="removeRouletteOption(${i})">✕</button></div>
    `).join('');
}
function drawRouletteWheel() {
    const canvas = document.getElementById('roulette-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const opts = getRouletteOpts();
    const size = canvas.width; const center = size/2; const radius = center-4;
    ctx.clearRect(0, 0, size, size);
    if(opts.length === 0) return;
    const sliceAngle = (2 * Math.PI) / opts.length;
    opts.forEach((opt, i) => {
        const start = i * sliceAngle - Math.PI/2;
        ctx.beginPath(); ctx.moveTo(center, center); ctx.arc(center, center, radius, start, start + sliceAngle);
        ctx.fillStyle = ROULETTE_COLORS[i % ROULETTE_COLORS.length]; ctx.fill(); ctx.stroke();
        ctx.save(); ctx.translate(center, center); ctx.rotate(start + sliceAngle/2);
        ctx.fillStyle = '#fff'; ctx.font = `600 ${Math.min(14, 140/opts.length)}px Outfit`;
        ctx.textAlign = 'right'; ctx.fillText(opt.length>14?opt.slice(0,12)+'…':opt, radius-15, 5); ctx.restore();
    });
    ctx.beginPath(); ctx.arc(center, center, 25, 0, Math.PI*2); ctx.fillStyle = '#0a0a12'; ctx.fill(); ctx.stroke();
}
let lastRouletteWin = null;
let rouletteWinCount = 0;
function spinRoulette() {
    if(isSpinning) return;
    const opts = getRouletteOpts();
    if(opts.length < 2) return showToast('⚠️', 'Necesitás 2+ opciones');
    isSpinning = true;
    const canvas = document.getElementById('roulette-canvas');
    const targetAngle = (5 + Math.random()*5)*360 + Math.random()*360;
    const duration = 4000;
    const startT = performance.now();
    const startRot = wheelRotation;

    function anim(time) {
        const p = Math.min((time - startT) / duration, 1);
        const e = 1 - Math.pow(1 - p, 3);
        const cur = startRot + targetAngle * e;
        wheelRotation = cur;
        canvas.style.transform = `rotate(${cur}deg)`;
        if(p < 1) requestAnimationFrame(anim);
        else {
            isSpinning = false;
            const norm = ((360 - (cur%360)) + 360) % 360;
            const winIdx = Math.floor(norm / (360/opts.length)) % opts.length;
            const winner = opts[winIdx];
            
            document.getElementById('result-name').textContent = winner;
            document.getElementById('roulette-result').classList.remove('hidden');
            spawnHearts(document.getElementById('result-confetti')); // resusing hearts as confetti
            
            // Check achievement: El Bajón Perfecto
            if (winner === lastRouletteWin) {
                rouletteWinCount++;
                if (rouletteWinCount >= 2) unlockAchievement('bajon_perfecto'); // 3 times in a row
            } else {
                rouletteWinCount = 0;
                lastRouletteWin = winner;
            }
        }
    }
    requestAnimationFrame(anim);
}

// ═══════════════════════════════════════════════════════════
// COUPONS
// ═══════════════════════════════════════════════════════════
function switchCouponUser(user) {
    currentCouponUser = user;
    document.getElementById('tab-agus').classList.toggle('active', user === 'agus');
    document.getElementById('tab-lauti').classList.toggle('active', user === 'lauti');
    renderCoupons();
}
function addCoupon() {
    const title = document.getElementById('coupon-title').value.trim();
    if(!title) return;
    db.coupons.unshift({ id: Date.now(), title, icon: document.getElementById('coupon-icon').value, forUser: document.getElementById('coupon-for').value, createdBy: currentUser, createdAt: new Date().toISOString(), redeemed: false });
    updateDB('coupons', db.coupons);
    document.getElementById('coupon-title').value = '';
    showToast('🎟️', 'Cupón creado');
}
function renderCoupons() {
    if(!db.coupons) return;
    const avail = db.coupons.filter(c => c.forUser === currentCouponUser && !c.redeemed);
    const red = db.coupons.filter(c => c.forUser === currentCouponUser && c.redeemed);
    
    document.getElementById('no-coupons').classList.toggle('hidden', avail.length > 0);
    document.getElementById('coupons-grid').innerHTML = avail.map(c => `
        <div class="coupon-card">
            <button class="coupon-card-delete" onclick="deleteCoupon(${c.id})">✕</button>
            <span class="coupon-card-icon">${c.icon}</span><h4>${escapeHtml(c.title)}</h4>
            <p class="coupon-card-for">Por ${c.createdBy} · ${formatDate(c.createdAt)}</p>
            ${c.forUser === currentUser ? `<button class="btn-coupon-redeem" onclick="openRedeemModal(${c.id})">✨ Canjear</button>` : ''}
        </div>
    `).join('');
    
    document.getElementById('redeemed-grid').innerHTML = red.map(c => `
        <div class="coupon-card redeemed"><span class="coupon-card-icon">${c.icon}</span><h4>${escapeHtml(c.title)}</h4><span class="coupon-redeemed-badge">✅ Canjeado</span></div>
    `).join('');
}
function deleteCoupon(id) {
    db.coupons = db.coupons.filter(c => c.id !== id);
    updateDB('coupons', db.coupons);
}
function openRedeemModal(id) {
    const c = db.coupons.find(c => c.id === id);
    if(!c) return;
    pendingRedeemId = id;
    document.getElementById('modal-coupon-icon').textContent = c.icon;
    document.getElementById('modal-coupon-title').textContent = c.title;
    document.getElementById('redeem-modal').classList.remove('hidden');
}
function confirmRedeem() {
    const c = db.coupons.find(c => c.id === pendingRedeemId);
    if(c && !c.redeemed) {
        c.redeemed = true; c.redeemedAt = new Date().toISOString();
        updateDB('coupons', db.coupons);
        closeModal('redeem-modal');
        document.getElementById('success-message').textContent = `Canjeado: ${c.title}`;
        document.getElementById('success-modal').classList.remove('hidden');
    }
}
function toggleRedeemed() { document.getElementById('redeemed-grid').classList.toggle('collapsed'); }

// ═══════════════════════════════════════════════════════════
// TIME CAPSULE
// ═══════════════════════════════════════════════════════════
function addCapsulePhoto() {
    const m = document.getElementById('capsule-month').value.trim();
    const d = document.getElementById('capsule-desc').value.trim();
    const img = document.getElementById('capsule-img').value.trim();
    if(!m || !d) return showToast('⚠️', 'Falta mes o descripción');
    
    db.capsule.monthlyPhotos.unshift({ id: Date.now(), month: m, desc: d, img: img || 'https://via.placeholder.com/400x300?text=💕' });
    updateDB('capsule', db.capsule);
    document.getElementById('capsule-month').value = '';
    document.getElementById('capsule-desc').value = '';
    document.getElementById('capsule-img').value = '';
}
function renderCapsule() {
    if(!db.capsule) return;
    document.getElementById('capsule-gallery').innerHTML = db.capsule.monthlyPhotos.map(p => `
        <div class="capsule-item">
            ${p.img ? `<img src="${escapeHtml(p.img)}" class="capsule-item-img">` : `<div class="capsule-item-img">📸</div>`}
            <h4 class="capsule-item-month">${escapeHtml(p.month)}</h4>
            <p class="capsule-item-desc">${escapeHtml(p.desc)}</p>
        </div>
    `).join('');

    const msg = db.capsule.futureMessage;
    if (msg) {
        document.getElementById('future-message-form').classList.add('hidden');
        document.getElementById('locked-message-display').classList.remove('hidden');
        document.getElementById('lock-target-date').textContent = `Disponible el ${formatDate(msg.date)}`;
        
        // Progress bar logic
        const start = new Date(msg.createdAt).getTime();
        const end = new Date(msg.date).getTime();
        const now = Date.now();
        const p = Math.max(0, Math.min(100, ((now - start) / (end - start)) * 100));
        document.getElementById('lock-progress').style.width = `${p}%`;
    }
}
function lockFutureMessage() {
    const d = document.getElementById('future-date').value;
    const t = document.getElementById('future-title').value;
    const c = document.getElementById('future-content').value;
    if(!d || !c) return showToast('⚠️', 'Falta fecha o contenido');
    
    db.capsule.futureMessage = { date: d, title: t, content: c, createdAt: new Date().toISOString() };
    updateDB('capsule', db.capsule);
}
function tryUnlockMessage() {
    const msg = db.capsule.futureMessage;
    if(!msg) return;
    if (Date.now() >= new Date(msg.date).getTime()) {
        showToast('🔓', '¡Mensaje desbloqueado!');
        // Ideally we would show a modal with the content here.
        alert(`Mensaje del pasado:\n\n${msg.content}`);
    } else {
        showToast('🔒', 'Todavía no es la fecha.');
    }
}

// ═══════════════════════════════════════════════════════════
// MOTO TRACKER
// ═══════════════════════════════════════════════════════════
function updateMoto(field, amount) {
    if(!db.moto) db.moto = {km:0, rainCount:0, routes:[]};
    db.moto[field] += amount;
    updateDB('moto', db.moto);
    if(field === 'rain' && db.moto.rainCount === 1) unlockAchievement('lluvia_moto');
}
function addRoute() {
    const val = document.getElementById('moto-route').value.trim();
    if(!val) return;
    db.moto.routes.unshift({ id: Date.now(), text: val, date: new Date().toISOString() });
    updateDB('moto', db.moto);
    document.getElementById('moto-route').value = '';
}
function renderMoto() {
    if(!db.moto) return;
    document.getElementById('moto-km').textContent = db.moto.km + ' km';
    document.getElementById('moto-rain').textContent = db.moto.rainCount;
    document.getElementById('routes-list').innerHTML = db.moto.routes.map(r => `
        <div class="route-item"><span style="font-size:1.5rem">📍</span><div><b>${escapeHtml(r.text)}</b><br><small>${formatDate(r.date)}</small></div></div>
    `).join('');
}

// ═══════════════════════════════════════════════════════════
// PHRASES
// ═══════════════════════════════════════════════════════════
function addPhrase() {
    const t = document.getElementById('phrase-input').value.trim();
    if(!t) return;
    db.phrases.unshift({ id: Date.now(), text: t, author: document.getElementById('phrase-author').value, date: new Date().toISOString() });
    updateDB('phrases', db.phrases);
    document.getElementById('phrase-input').value = '';
}
function deletePhrase(id) {
    db.phrases = db.phrases.filter(p => p.id !== id);
    updateDB('phrases', db.phrases);
}
function renderPhrases() {
    if(!db.phrases) return;
    document.getElementById('postit-board').innerHTML = db.phrases.map(p => `
        <div class="postit">
            <button class="postit-delete" onclick="deletePhrase(${p.id})">✕</button>
            "${escapeHtml(p.text)}"
            <div class="postit-author">- ${p.author === 'ambos' ? 'Los dos' : p.author === 'agus' ? 'Agus' : 'Lauti'}</div>
        </div>
    `).join('');
}

// ═══════════════════════════════════════════════════════════
// NOTES (NOTITAS)
// ═══════════════════════════════════════════════════════════
function addNote() {
    const input = document.getElementById('note-input');
    const text = input.value.trim();
    if (!text) return showToast('⚠️', 'Escribí algo primero');
    const forUser = document.getElementById('note-for').value;
    createNote(text, forUser);
    input.value = '';
}

function addNoteFromWidget() {
    const input = document.getElementById('notes-widget-input');
    const text = input.value.trim();
    if (!text || !currentUser) return;
    const partner = currentUser === 'agus' ? 'lauti' : 'agus';
    createNote(text, partner);
    input.value = '';
}

function createNote(text, forUser) {
    if (!db.notes) db.notes = [];
    db.notes.unshift({
        id: Date.now(),
        text,
        forUser,
        createdBy: currentUser,
        createdAt: new Date().toISOString(),
        read: false
    });
    updateDB('notes', db.notes);
    showToast('💌', 'Notita enviada');
}

function deleteNote(id) {
    db.notes = (db.notes || []).filter(n => n.id !== id);
    updateDB('notes', db.notes);
}

function markNotesRead() {
    if (!db.notes || !currentUser) return;
    let changed = false;
    db.notes.forEach(n => {
        if (n.forUser === currentUser && !n.read) { n.read = true; changed = true; }
    });
    if (changed) updateDB('notes', db.notes);
    else { updateNotesBadge(); renderNotesWidget(); }
}

function updateNotesBadge() {
    const badge = document.getElementById('notes-badge');
    const widgetBadge = document.getElementById('notes-widget-badge');
    if (!currentUser) return;
    const unread = (db.notes || []).filter(n => n.forUser === currentUser && !n.read).length;

    if (badge) {
        badge.textContent = unread;
        badge.classList.toggle('hidden', unread === 0 || currentSection === 'notes');
    }
    if (widgetBadge) {
        widgetBadge.textContent = `${unread} nueva${unread === 1 ? '' : 's'}`;
        widgetBadge.classList.toggle('hidden', unread === 0);
    }
}

function renderNotes() {
    if (!db.notes || !currentUser) return;

    // Autoseleccionar "Para <mi pareja>" en el formulario
    const forSelect = document.getElementById('note-for');
    if (forSelect && !forSelect.dataset.userSet) {
        const partner = currentUser === 'agus' ? 'lauti' : 'agus';
        forSelect.value = partner;
        forSelect.dataset.userSet = '1';
    }

    const visible = db.notes.filter(n => n.forUser === currentUser || n.createdBy === currentUser);
    const board = document.getElementById('notes-board');
    if (board) {
        board.innerHTML = visible.length ? visible.map(n => `
            <div class="postit ${n.forUser === currentUser && !n.read ? 'postit-unread' : ''}">
                <button class="postit-delete" onclick="deleteNote(${n.id})">✕</button>
                ${n.forUser === currentUser && !n.read ? '<span class="postit-unread-dot"></span>' : ''}
                "${escapeHtml(n.text)}"
                <div class="postit-author">
                    ${n.createdBy === currentUser
                        ? `Para ${n.forUser === 'agus' ? 'Agus' : 'Lauti'} · ${formatDate(n.createdAt)}`
                        : `De ${n.createdBy === 'agus' ? 'Agus' : 'Lauti'} · ${formatDate(n.createdAt)}`}
                </div>
            </div>
        `).join('') : `<p style="text-align:center;color:var(--text-tertiary);padding:2rem;">Todavía no hay notitas. ¡Dejale una a tu pareja! 💕</p>`;
    }

    updateNotesBadge();
    renderNotesWidget();
}

// ─── Widget en vivo del Dashboard ───
function renderNotesWidget() {
    const feed = document.getElementById('notes-widget-feed');
    if (!feed || !currentUser || !db.notes) return;

    const visible = db.notes
        .filter(n => n.forUser === currentUser || n.createdBy === currentUser)
        .slice(0, 5);

    feed.innerHTML = visible.length ? visible.map(n => {
        const isReceived = n.createdBy !== currentUser;
        const unread = isReceived && !n.read;
        const who = isReceived
            ? (n.createdBy === 'agus' ? 'Agus' : 'Lauti')
            : `Para ${n.forUser === 'agus' ? 'Agus' : 'Lauti'}`;
        return `
            <div class="notes-widget-item ${unread ? 'unread' : ''}">
                <span class="notes-widget-item-emoji">${isReceived ? '💌' : '📤'}</span>
                <div class="notes-widget-item-body">
                    <p class="notes-widget-item-text">${escapeHtml(n.text)}</p>
                    <p class="notes-widget-item-meta">${who} · ${formatDate(n.createdAt)}</p>
                </div>
            </div>
        `;
    }).join('') : `<p class="notes-widget-empty">Todavía no hay notitas 💕</p>`;
}

// ─── Detección en tiempo real (llega mientras la app está abierta) ───
function handleIncomingNotes(newNotes) {
    if (!currentUser || !Array.isArray(newNotes)) return;
    const oldNotes = db.notes || [];
    const brandNew = newNotes.filter(n => !oldNotes.some(old => old.id === n.id));

    brandNew.forEach(n => {
        if (n.forUser === currentUser && n.createdBy !== currentUser) {
            const senderName = n.createdBy === 'agus' ? 'Agus' : 'Lauti';
            showNoteToast(senderName, n.text);
            if (navigator.vibrate) navigator.vibrate([120, 60, 120]);
        }
    });
}

let noteToastTimeout;
function showNoteToast(fromName, text) {
    const toast = document.getElementById('note-toast');
    if (!toast) return;
    document.getElementById('note-toast-from').textContent = `${fromName} te dejó una notita`;
    document.getElementById('note-toast-text').textContent = text;
    toast.onclick = () => { navigateTo('notes'); closeNoteToast(); };

    toast.classList.remove('hidden');
    void toast.offsetWidth;
    toast.classList.add('show');

    clearTimeout(noteToastTimeout);
    noteToastTimeout = setTimeout(closeNoteToast, 6000);
}
function closeNoteToast() {
    const toast = document.getElementById('note-toast');
    if (!toast) return;
    toast.classList.remove('show');
    clearTimeout(noteToastTimeout);
    setTimeout(() => toast.classList.add('hidden'), 400);
}


const ACHIEVEMENTS_DEF = {
    'cinefilos': { icon: '🍿', name: 'Cinéfilos', desc: 'Ver 10 películas juntos' },
    'invierno': { icon: '❄️', name: 'Supervivientes del Invierno', desc: 'Pasar su primer invierno juntos' },
    'bajon_perfecto': { icon: '🍔', name: 'El Bajón Perfecto', desc: 'Que la ruleta elija lo mismo 2 veces seguidas' },
    'lluvia_moto': { icon: '🌧️', name: 'Acuáticos', desc: 'Que los agarre la lluvia en la moto' },
};

function unlockAchievement(id) {
    if(!db.achievements) db.achievements = [];
    if (db.achievements.find(a => a.id === id && a.unlocked)) return;
    
    db.achievements.push({ id, unlocked: true, date: new Date().toISOString() });
    updateDB('achievements', db.achievements);
    
    const def = ACHIEVEMENTS_DEF[id];
    document.getElementById('achievement-title-modal').textContent = def.name;
    document.getElementById('achievement-desc-modal').textContent = def.desc;
    document.getElementById('achievement-modal').classList.remove('hidden');
}
function checkAchievements() {
    // Check cinefilos
    const movies = db.plans?.filter(p => p.category === 'movie' && p.status === 'done').length || 0;
    if (movies >= 10) unlockAchievement('cinefilos');
    
    // Check winter (June-August in Argentina)
    const m = new Date().getMonth();
    if (m >= 5 && m <= 7) unlockAchievement('invierno');
}
function renderAchievements() {
    let html = '';
    for (const [id, def] of Object.entries(ACHIEVEMENTS_DEF)) {
        const ach = db.achievements?.find(a => a.id === id && a.unlocked);
        html += `
            <div class="achievement-card ${ach ? 'unlocked' : 'locked'}">
                <span class="achievement-icon">${def.icon}</span>
                <h4 class="achievement-name">${def.name}</h4>
                <p class="achievement-desc">${def.desc}</p>
                ${ach ? `<p style="font-size:0.7rem;color:var(--text-tertiary);margin-top:0.5rem">Desbloqueado: ${formatDate(ach.date)}</p>` : ''}
            </div>
        `;
    }
    document.getElementById('achievements-grid').innerHTML = html;
}

// ═══════════════════════════════════════════════════════════
// REAL-TIME WIDGET (Sockets)
// ═══════════════════════════════════════════════════════════
function toggleRtMenu() {
    document.getElementById('rt-menu').classList.toggle('hidden');
}
function sendMates() {
    if(socket) socket.emit('send-mates', currentUser);
    showToast('🧉', '¡Invitación enviada!');
    toggleRtMenu();
}

// Virtual Touch
let isHoldingTouch = false;
let touchTimeout;

const touchBtn = document.getElementById('rt-touch-btn');
if(touchBtn) {
    const startTouch = (e) => {
        e.preventDefault();
        isHoldingTouch = true;
        if(socket) socket.emit('touch-start', currentUser);
    };
    const endTouch = (e) => {
        e.preventDefault();
        isHoldingTouch = false;
        if(socket) socket.emit('touch-end', currentUser);
        hideTouchOverlay();
    };
    touchBtn.addEventListener('mousedown', startTouch);
    touchBtn.addEventListener('mouseup', endTouch);
    touchBtn.addEventListener('mouseleave', endTouch);
    touchBtn.addEventListener('touchstart', startTouch);
    touchBtn.addEventListener('touchend', endTouch);
}

function showTouchOverlay() {
    document.getElementById('touch-overlay').classList.remove('hidden');
    if (navigator.vibrate) navigator.vibrate(1000);
}
function hideTouchOverlay() {
    document.getElementById('touch-overlay').classList.add('hidden');
}

// ═══════════════════════════════════════════════════════════
// UTILS
// ═══════════════════════════════════════════════════════════
function escapeHtml(str) {
    const div = document.createElement('div'); div.textContent = str; return div.innerHTML;
}
function formatDate(iso) {
    if(!iso) return '';
    return new Date(iso).toLocaleDateString('es-AR', { day: 'numeric', month: 'short', year: 'numeric' });
}
function closeModal(id) { document.getElementById(id).classList.add('hidden'); }
function showToast(icon, msg) {
    const t = document.getElementById('toast');
    document.getElementById('toast-icon').textContent = icon;
    document.getElementById('toast-message').textContent = msg;
    t.classList.remove('hidden'); void t.offsetWidth; t.classList.add('show');
    setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.classList.add('hidden'), 400); }, 3000);
}

document.addEventListener('DOMContentLoaded', initApp);

// ═══════════════════════════════════════════════════════════
// PUSH NOTIFICATIONS
// ═══════════════════════════════════════════════════════════
function urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; i++) outputArray[i] = rawData.charCodeAt(i);
    return outputArray;
}

async function setupPushNotifications() {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
        console.warn('Este navegador no soporta notificaciones push.');
        return;
    }
    if (!currentUser) return;

    try {
        const registration = await navigator.serviceWorker.register('/service-worker.js');

        // Si ya había permiso denegado antes, no insistimos
        if (Notification.permission === 'denied') return;

        let permission = Notification.permission;
        if (permission === 'default') {
            // Pedimos el permiso recién cuando el usuario ya está logueado,
            // para que el pedido tenga contexto y no espante apenas entra.
            permission = await Notification.requestPermission();
        }
        if (permission !== 'granted') return;

        let subscription = await registration.pushManager.getSubscription();
        if (!subscription) {
            const res = await fetch('/api/vapid-public-key');
            const { publicKey } = await res.json();
            subscription = await registration.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: urlBase64ToUint8Array(publicKey)
            });
        }

        await fetch('/api/subscribe', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ user: currentUser, subscription })
        });
    } catch (e) {
        console.warn('No se pudo activar las notificaciones push:', e);
    }
}
