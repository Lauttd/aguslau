const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const fs = require('fs');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 8080;
const DB_FILE = path.join(__dirname, 'database.json');

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
    }
};

// Initialize DB if not exists
if (!fs.existsSync(DB_FILE)) {
    fs.writeFileSync(DB_FILE, JSON.stringify(DEFAULT_DB, null, 2));
}

let db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));

// Save DB helper
function saveDB() {
    try {
        fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
    } catch (e) {
        console.warn("No se pudo escribir en el disco, manteniendo cambios en memoria.");
    }
}

app.use(express.static(__dirname));
app.use(express.json());

// API Routes
app.get('/api/data', (req, res) => {
    res.json(db);
});

app.post('/api/update', (req, res) => {
    const { key, value } = req.body;
    if (key && db[key] !== undefined) {
        db[key] = value;
        saveDB();
        
        // Notify all clients except the sender
        io.emit('data-updated', { key, value });
        res.json({ success: true });
    } else {
        res.status(400).json({ error: 'Invalid key' });
    }
});

// Socket.io for Real-time events
io.on('connection', (socket) => {
    console.log('A user connected:', socket.id);

    // Mates button
    socket.on('send-mates', (fromUser) => {
        // Broadcast to everyone else
        socket.broadcast.emit('receive-mates', fromUser);
    });

    // Virtual Touch
    socket.on('touch-start', (user) => {
        socket.broadcast.emit('partner-touch-start', user);
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
