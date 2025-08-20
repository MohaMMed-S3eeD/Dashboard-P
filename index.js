"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const promises_1 = __importDefault(require("fs/promises"));
const blob_1 = require("@vercel/blob");
const postgres_1 = require("@vercel/postgres");
const app = (0, express_1.default)();
const PORT = process.env.PORT || 3000;
app.use(express_1.default.json());
app.use(express_1.default.urlencoded({ extended: true }));
app.set('views', path_1.default.join(__dirname, 'views'));
app.set('view engine', 'ejs');
app.get('/', async (req, res) => {
    try {
        await renderHome(res);
    }
    catch (e) {
        console.error(e);
        res.status(500).send('Failed to load home page');
    }
});
const dataDir = path_1.default.join(__dirname, 'data');
const dataFile = path_1.default.join(dataDir, 'users.json');
const blobKey = 'data/users.json';
function isBlobEnabled() {
    return Boolean(process.env.BLOB_READ_WRITE_TOKEN || process.env.VERCEL);
}
function isDbEnabled() {
    return Boolean(process.env.POSTGRES_URL || process.env.POSTGRES_PRISMA_URL || process.env.POSTGRES_URL_NON_POOLING);
}
async function ensureDataFileExists() {
    try {
        await promises_1.default.mkdir(dataDir, { recursive: true });
        await promises_1.default.access(dataFile, fs_1.default.constants.F_OK).catch(async () => {
            await promises_1.default.writeFile(dataFile, '[]', 'utf-8');
        });
    }
    catch (error) {
        console.error('Failed to ensure data file exists:', error);
        throw error;
    }
}
async function readUsersFromFile() {
    await ensureDataFileExists();
    const raw = await promises_1.default.readFile(dataFile, 'utf-8');
    try {
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
    }
    catch {
        return [];
    }
}
async function writeUsersToFile(fileUsers) {
    await promises_1.default.writeFile(dataFile, JSON.stringify(fileUsers, null, 2), 'utf-8');
}
async function readUsersFromBlob() {
    try {
        const blobs = await (0, blob_1.list)({ prefix: blobKey, limit: 1 });
        const entry = blobs.blobs.find((b) => b.pathname === blobKey) || blobs.blobs[0];
        if (!entry)
            return [];
        const res = await fetch(entry.url);
        if (!res.ok)
            return [];
        const parsed = await res.json();
        return Array.isArray(parsed) ? parsed : [];
    }
    catch {
        return [];
    }
}
async function writeUsersToBlob(fileUsers) {
    await (0, blob_1.put)(blobKey, JSON.stringify(fileUsers, null, 2), {
        access: 'public',
        addRandomSuffix: false,
        contentType: 'application/json; charset=utf-8',
    });
}
async function readUsers() {
    if (isDbEnabled())
        return await readUsersFromDb();
    if (isBlobEnabled())
        return await readUsersFromBlob();
    return await readUsersFromFile();
}
async function writeUsers(fileUsers) {
    if (isDbEnabled())
        return await writeUsersToDb(fileUsers);
    if (isBlobEnabled())
        return await writeUsersToBlob(fileUsers);
    return await writeUsersToFile(fileUsers);
}
async function ensureUsersTable() {
    await (0, postgres_1.sql) `
        CREATE TABLE IF NOT EXISTS users (
            id SERIAL PRIMARY KEY,
            name TEXT NOT NULL,
            email TEXT NOT NULL
        );
    `;
}
async function readUsersFromDb() {
    await ensureUsersTable();
    const { rows } = await (0, postgres_1.sql) `SELECT id, name, email FROM users ORDER BY id ASC`;
    return rows;
}
async function writeUsersToDb(fileUsers) {
    await ensureUsersTable();
    await (0, postgres_1.sql) `TRUNCATE TABLE users RESTART IDENTITY;`;
    for (const u of fileUsers) {
        await (0, postgres_1.sql) `INSERT INTO users (name, email) VALUES (${u.name}, ${u.email});`;
    }
}
async function renderHome(res, locals) {
    const fileUsers = await readUsers();
    res.render('index', { users: fileUsers, ...(locals || {}) });
}
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', uptime: process.uptime(), timestamp: new Date().toISOString() });
});
const users = [
    { id: 1, name: 'Alice', email: 'alice@example.com' },
    { id: 2, name: 'Bob', email: 'bob@example.com' }
];
let nextUserId = 3;
app.get('/api/users', (req, res) => {
    res.json(users);
});
app.get('/api/users-file', async (req, res) => {
    try {
        const fileUsers = await readUsers();
        res.json(fileUsers);
    }
    catch (e) {
        res.status(500).json({ error: 'Failed to read users' });
    }
});
app.get('/api/users/:id', (req, res) => {
    const id = Number(req.params.id);
    const user = users.find(u => u.id === id);
    if (!user) {
        return res.status(404).json({ error: 'User not found' });
    }
    res.json(user);
});
app.post('/api/users', (req, res) => {
    const { name, email } = req.body || {};
    if (!name || !email) {
        return res.status(400).json({ error: 'name and email are required' });
    }
    const newUser = { id: nextUserId++, name, email };
    users.push(newUser);
    res.status(201).json(newUser);
});
app.get('/users/new', (req, res) => {
    res.render('new-user');
});
app.post('/users', async (req, res) => {
    const name = (req.body?.name || '').toString().trim();
    const email = (req.body?.email || '').toString().trim();
    if (!name || !email) {
        res.status(400);
        await renderHome(res, { error: 'Name and email are required', name, email });
        return;
    }
    try {
        const currentUsers = await readUsers();
        const nextId = currentUsers.reduce((max, u) => (u.id > max ? u.id : max), 0) + 1;
        const newUser = { id: nextId, name, email };
        currentUsers.push(newUser);
        await writeUsers(currentUsers);
        return res.redirect('/');
    }
    catch (e) {
        console.error(e);
        res.status(500);
        await renderHome(res, { error: 'Failed to save user. Please try again.', name, email });
        return;
    }
});
app.put('/api/users/:id', (req, res) => {
    const id = Number(req.params.id);
    const index = users.findIndex(u => u.id === id);
    if (index === -1) {
        return res.status(404).json({ error: 'User not found' });
    }
    const { name, email } = req.body || {};
    if (!name || !email) {
        return res.status(400).json({ error: 'name and email are required' });
    }
    users[index] = { id, name, email };
    res.json(users[index]);
});
app.delete('/api/users/:id', (req, res) => {
    const id = Number(req.params.id);
    const index = users.findIndex(u => u.id === id);
    if (index === -1) {
        return res.status(404).json({ error: 'User not found' });
    }
    users.splice(index, 1);
    res.status(204).send();
});
app.use((req, res) => {
    res.status(404).json({ error: 'Not Found' });
});
app.use((err, req, res, next) => {
    console.error(err);
    res.status(500).json({ error: 'Internal Server Error' });
});
if (process.env.NODE_ENV !== 'production') {
    app.listen(PORT, () => {
        console.log(`Server running on http://localhost:${PORT}`);
    });
}
exports.default = app;
