const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const fs = require('fs');
const path = require('path');
const webpush = require('web-push');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 8080;
const DB_FILE = path.join(__dirname, 'database.json');

// ─── PUSH NOTIFICATIONS (VAPID) ───
// En Render, configurá estas 3 variables de entorno con tus propios valores
// (Settings → Environment). Si no las seteás, usa las de este proyecto por
// defecto para que funcione igual de una.
const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || 'BC2Z8ClhE8vvqIqQegHUN0nXEBWbHuk2xY3_4gtSmCc0B28d_OC2-En0pONNHbgiPcZeYntTcTAVnsIUpzgHcMg';
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || 'danTGp2g7SZE-O8P36M_sr9-UmpBKtOAXdOYLtMaqWo';
const VAPID_EMAIL = process.env.VAPID_EMAIL || 'mailto:portal@aguslau.app';

webpush.setVapidDetails(VAPID_EMAIL, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

const USERS = ['agus', 'lauti'];
function otherUser(user) {
    return user === 'agus' ? 'lauti' : (user === 'lauti' ? 'agus' : null);
}

// Default database structure
const DEFAULT_DB = {
    plans: [],
    coupons: [],
    roulette_food: ['Hamburguesas 🍔', 'Pizza 🍕', 'Milanesa con puré', 'Lomitos 🥖'],
    roulette_activity: ['Noche de película 🎬', 'Paseo al aire libre 🌳', 'Noche de juegos 🎮'],
    moods: {
        agus: { text: 'Sin estado aún', time: null },
        lauti: { text: 'Sin estado aún', time: null }
    },
    phrases: [],
    moto: {
        routes: [],
        km: 0,
        rainCount: 0
    },
    achievements: [],
    capsule: {
        monthlyPhotos: [],
        futureMessage: null
    },
    notes: [],
    subscriptions: {
        agus: [],
        lauti: []
    }
};

// Initialize DB if not exists
if (!fs.existsSync(DB_FILE)) {
    fs.writeFileSync(DB_FILE, JSON.stringify(DEFAULT_DB, null, 2));
}

let db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
if (!db.subscriptions) db.subscriptions = { agus: [], lauti: [] };
if (!db.notes) db.notes = [];

// Save DB helper
function saveDB() {
    try {
        fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
    } catch (e) {
        console.warn("No se pudo escribir en el disco, manteniendo cambios en memoria.");
    }
}

// ─── PUSH HELPER ───
// Manda una notificación a TODOS los dispositivos suscriptos de un usuario
// (agus / lauti). Si una suscripción ya expiró (410/404), la borra sola.
async function sendPushToUser(user, payload) {
    const subs = db.subscriptions[user] || [];
    if (!subs.length) return;

    const results = await Promise.allSettled(
        subs.map((sub) => webpush.sendNotification(sub, JSON.stringify(payload)))
    );

    let changed = false;
    results.forEach((result, i) => {
        if (result.status === 'rejected') {
            const statusCode = result.reason && result.reason.statusCode;
            if (statusCode === 404 || statusCode === 410) {
                subs.splice(i, 1);
                changed = true;
            } else {
                console.warn('Push error:', result.reason && result.reason.message);
            }
        }
    });
    if (changed) saveDB();
}

app.use(express.static(__dirname));
app.use(express.json());

// API Routes
app.get('/api/data', (req, res) => {
    res.json(db);
});

app.get('/api/vapid-public-key', (req, res) => {
    res.json({ publicKey: VAPID_PUBLIC_KEY });
});

// Guardar la suscripción push de un usuario (agus / lauti)
app.post('/api/subscribe', (req, res) => {
    const { user, subscription } = req.body;
    if (!USERS.includes(user) || !subscription || !subscription.endpoint) {
        return res.status(400).json({ error: 'Datos inválidos' });
    }
    if (!db.subscriptions[user]) db.subscriptions[user] = [];

    const exists = db.subscriptions[user].some((s) => s.endpoint === subscription.endpoint);
    if (!exists) {
        db.subscriptions[user].push(subscription);
        saveDB();
    }
    res.json({ success: true });
});

app.post('/api/unsubscribe', (req, res) => {
    const { user, endpoint } = req.body;
    if (!USERS.includes(user) || !endpoint) return res.status(400).json({ error: 'Datos inválidos' });
    db.subscriptions[user] = (db.subscriptions[user] || []).filter((s) => s.endpoint !== endpoint);
    saveDB();
    res.json({ success: true });
});

app.post('/api/update', async (req, res) => {
    const { key, value, user } = req.body;
    if (!key || db[key] === undefined) {
        return res.status(400).json({ error: 'Invalid key' });
    }

    const previous = db[key];
    db[key] = value;
    saveDB();

    // Notify all clients except the sender (real-time UI sync)
    io.emit('data-updated', { key, value });
    res.json({ success: true });

    // ─── Push notifications según qué cambió ───
    try {
        await handlePushForUpdate(key, previous, value, user);
    } catch (e) {
        console.warn('Error enviando push:', e.message);
    }
});

async function handlePushForUpdate(key, previous, value, user) {
    const senderName = user === 'agus' ? 'Agus' : (user === 'lauti' ? 'Lauti' : 'Tu pareja');
    const target = otherUser(user);

    if (key === 'plans' && Array.isArray(value) && Array.isArray(previous) && value.length > (previous.length || 0)) {
        const newPlan = value.find((p) => !previous.some((old) => old.id === p.id));
        if (newPlan && target) {
            await sendPushToUser(target, {
                title: '📋 Nuevo plan juntos',
                body: `${senderName} agregó: "${newPlan.text}"`,
                tag: 'plan-nuevo',
                url: '/'
            });
        }
    }

    if (key === 'coupons' && Array.isArray(value) && Array.isArray(previous) && value.length > (previous.length || 0)) {
        const newCoupon = value.find((c) => !previous.some((old) => old.id === c.id));
        if (newCoupon && newCoupon.forUser) {
            await sendPushToUser(newCoupon.forUser, {
                title: '🎟️ Nuevo cupón de amor',
                body: `${senderName} te mandó: "${newCoupon.title}"`,
                tag: 'cupon-nuevo',
                url: '/'
            });
        }
    }

    if (key === 'achievements' && Array.isArray(value) && Array.isArray(previous) && value.length > (previous.length || 0)) {
        const newAch = value.find((a) => !previous.some((old) => old.id === a.id));
        if (newAch) {
            // Los logros son de la pareja: se lo mandamos a los dos
            await Promise.all(USERS.map((u) => sendPushToUser(u, {
                title: '🏆 ¡Nuevo logro desbloqueado!',
                body: 'Desbloquearon un logro amoroso nuevo. ¡Andá a verlo! ✨',
                tag: 'logro-nuevo',
                url: '/'
            })));
        }
    }

    if (key === 'moods' && value && previous && target) {
        const before = previous[user] && previous[user].time;
        const after = value[user] && value[user].time;
        if (after && after !== before) {
            await sendPushToUser(target, {
                title: '💭 Nuevo estado de ánimo',
                body: `${senderName} está: "${value[user].text}"`,
                tag: 'mood',
                url: '/'
            });
        }
    }

    if (key === 'capsule' && value && previous && target) {
        const beforePhotos = previous.monthlyPhotos || [];
        const afterPhotos = value.monthlyPhotos || [];
        if (afterPhotos.length > beforePhotos.length) {
            const newPhoto = afterPhotos.find((p) => !beforePhotos.some((old) => old.id === p.id));
            if (newPhoto) {
                await sendPushToUser(target, {
                    title: '🕰️ Nuevo recuerdo en la cápsula',
                    body: `${senderName} agregó "${newPhoto.month}" a la cápsula del tiempo`,
                    tag: 'capsula-foto',
                    url: '/'
                });
            }
        }
        if (!previous.futureMessage && value.futureMessage) {
            await sendPushToUser(target, {
                title: '🔒 Mensaje al futuro guardado',
                body: `${senderName} dejó un mensaje sellado para el ${value.futureMessage.date}`,
                tag: 'capsula-mensaje',
                url: '/'
            });
        }
    }

    if (key === 'moto' && value && previous && target) {
        const beforeRoutes = previous.routes || [];
        const afterRoutes = value.routes || [];
        if (afterRoutes.length > beforeRoutes.length) {
            const newRoute = afterRoutes.find((r) => !beforeRoutes.some((old) => old.id === r.id));
            if (newRoute) {
                await sendPushToUser(target, {
                    title: '🏍️ Nueva ruta registrada',
                    body: `${senderName} registró: "${newRoute.text}"`,
                    tag: 'moto-ruta',
                    url: '/'
                });
            }
        }
        if ((value.rainCount || 0) > (previous.rainCount || 0)) {
            await sendPushToUser(target, {
                title: '🌧️ ¡Los agarró la lluvia!',
                body: `${senderName} registró que los agarró la lluvia en la moto`,
                tag: 'moto-lluvia',
                url: '/'
            });
        }
    }

    if (key === 'phrases' && Array.isArray(value) && Array.isArray(previous) && value.length > (previous.length || 0)) {
        const newPhrase = value.find((p) => !previous.some((old) => old.id === p.id));
        if (newPhrase && target) {
            await sendPushToUser(target, {
                title: '📝 Nueva frase célebre',
                body: `"${newPhrase.text}"`,
                tag: 'frase-nueva',
                url: '/'
            });
        }
    }

    if (key === 'notes' && Array.isArray(value) && Array.isArray(previous) && value.length > (previous.length || 0)) {
        const newNote = value.find((n) => !previous.some((old) => old.id === n.id));
        if (newNote && newNote.forUser) {
            await sendPushToUser(newNote.forUser, {
                title: '💌 Te dejaron una notita',
                body: `${senderName}: "${newNote.text}"`,
                tag: 'notita-nueva',
                url: '/'
            });
        }
    }
}

// Socket.io for Real-time events
io.on('connection', (socket) => {
    console.log('A user connected:', socket.id);

    // Mates button
    socket.on('send-mates', async (fromUser) => {
        socket.broadcast.emit('receive-mates', fromUser);

        const senderName = fromUser === 'agus' ? 'Agus' : 'Lauti';
        const target = otherUser(fromUser);
        if (target) {
            try {
                await sendPushToUser(target, {
                    title: '🧉 ¿Salen mates?',
                    body: `${senderName} te está invitando a tomar unos mates`,
                    tag: 'mates',
                    url: '/'
                });
            } catch (e) { console.warn('Push mates error:', e.message); }
        }
    });

    // Virtual Touch
    socket.on('touch-start', async (user) => {
        socket.broadcast.emit('partner-touch-start', user);

        const senderName = user === 'agus' ? 'Agus' : 'Lauti';
        const target = otherUser(user);
        if (target) {
            try {
                await sendPushToUser(target, {
                    title: '✨ Toque virtual',
                    body: `${senderName} te está buscando para conectarse ✨`,
                    tag: 'toque',
                    url: '/'
                });
            } catch (e) { console.warn('Push touch error:', e.message); }
        }
    });

    socket.on('touch-end', (user) => {
        socket.broadcast.emit('partner-touch-end', user);
    });

    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
    });
});

server.listen(PORT, () => {
    console.log(`El Portal de la Pareja corriendo en http://localhost:${PORT}`);
});
