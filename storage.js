/* storage.js — Capa de persistencia
 *
 * Si existe la variable de entorno MONGODB_URI, todos los datos se guardan
 * en MongoDB Atlas (persistencia real, sobrevive a redeploys y reinicios).
 *
 * Si NO existe (por ejemplo corriendo en tu PC sin configurarla), cae
 * automáticamente a un archivo local database.json, útil para desarrollo,
 * pero NO recomendado en producción porque se puede perder en cada deploy.
 */

const fs = require('fs');
const path = require('path');

const DB_FILE = path.join(__dirname, 'database.json');
const MONGODB_URI = process.env.MONGODB_URI || '';
const DB_NAME = process.env.MONGODB_DB_NAME || 'portal_pareja';

let mongoClient = null;
let mongoCollection = null;
let mongoConnected = false;
const usingMongo = !!MONGODB_URI;

async function connectMongo() {
    if (mongoCollection) return mongoCollection;
    const { MongoClient } = require('mongodb');
    mongoClient = new MongoClient(MONGODB_URI);
    await mongoClient.connect();
    const dbConn = mongoClient.db(DB_NAME);
    mongoCollection = dbConn.collection('state');
    mongoConnected = true;
    console.log('✅ Conectado a MongoDB Atlas — persistencia real activada.');
    return mongoCollection;
}

async function loadDB(defaultDB) {
    if (usingMongo) {
        try {
            const col = await connectMongo();
            let doc = await col.findOne({ _id: 'portal' });
            if (!doc) {
                doc = { _id: 'portal', ...defaultDB };
                await col.insertOne(doc);
            }
            delete doc._id;
            return doc;
        } catch (e) {
            console.error('❌ No se pudo conectar a MongoDB Atlas:', e.message);
            console.error('   Revisá MONGODB_URI (usuario/contraseña/IP permitida en Atlas).');
            console.error('   Arrancando igual con almacenamiento local temporal para no caerse.');
        }
    }

    // ─── Fallback local (solo para desarrollo, o si Mongo falló) ───
    if (!fs.existsSync(DB_FILE)) {
        fs.writeFileSync(DB_FILE, JSON.stringify(defaultDB, null, 2));
    }
    return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
}

async function saveDB(db) {
    if (usingMongo) {
        try {
            const col = await connectMongo();
            await col.replaceOne({ _id: 'portal' }, { _id: 'portal', ...db }, { upsert: true });
            return;
        } catch (e) {
            console.error('❌ Error guardando en MongoDB, guardo copia local de emergencia:', e.message);
        }
    }

    try {
        fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
    } catch (e) {
        console.warn('No se pudo escribir en el disco, manteniendo cambios en memoria.');
    }
}

function isPersistent() {
    return mongoConnected;
}

module.exports = { loadDB, saveDB, usingMongo, isPersistent };
