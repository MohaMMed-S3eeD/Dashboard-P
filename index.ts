import express, { Request, Response, NextFunction } from 'express';
import path from 'path';
import fs from 'fs';
import fsPromises from 'fs/promises';
import { put, list } from '@vercel/blob';
import { sql } from '@vercel/postgres';

const app = express();
const PORT = process.env.PORT || 3000;

// Middlewares
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// View Engine Setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');

app.get('/', async (req: Request, res: Response) => {
    try {
        await renderHome(res);
    } catch (e) {
        console.error(e);
        res.status(500).send('Failed to load home page');
    }
});

// Shared types
type User = { id: number; name: string; email: string };

// Storage helpers (file in dev, Vercel Blob in prod)
const dataDir = path.join(__dirname, 'data');
const dataFile = path.join(dataDir, 'users.json');
const blobKey = 'data/users.json';

function isBlobEnabled(): boolean {
    return Boolean(process.env.BLOB_READ_WRITE_TOKEN || process.env.VERCEL);
}

function isDbEnabled(): boolean {
    return Boolean(process.env.POSTGRES_URL || process.env.POSTGRES_PRISMA_URL || process.env.POSTGRES_URL_NON_POOLING);
}

async function ensureDataFileExists(): Promise<void> {
    try {
        await fsPromises.mkdir(dataDir, { recursive: true });
        await fsPromises.access(dataFile, fs.constants.F_OK).catch(async () => {
            await fsPromises.writeFile(dataFile, '[]', 'utf-8');
        });
    } catch (error) {
        console.error('Failed to ensure data file exists:', error);
        throw error;
    }
}

async function readUsersFromFile(): Promise<User[]> {
    await ensureDataFileExists();
    const raw = await fsPromises.readFile(dataFile, 'utf-8');
    try {
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
}

async function writeUsersToFile(fileUsers: User[]): Promise<void> {
    await fsPromises.writeFile(dataFile, JSON.stringify(fileUsers, null, 2), 'utf-8');
}

async function readUsersFromBlob(): Promise<User[]> {
    try {
        const blobs = await list({ prefix: blobKey, limit: 1 });
        const entry = blobs.blobs.find((b: { pathname: string }) => b.pathname === blobKey) || blobs.blobs[0];
        if (!entry) return [];
        const res = await fetch(entry.url);
        if (!res.ok) return [];
        const parsed = await res.json();
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
}

async function writeUsersToBlob(fileUsers: User[]): Promise<void> {
    await put(blobKey, JSON.stringify(fileUsers, null, 2), {
        access: 'public',
        addRandomSuffix: false,
        contentType: 'application/json; charset=utf-8',
    });
}

async function readUsers(): Promise<User[]> {
    if (isDbEnabled()) return await readUsersFromDb();
    if (isBlobEnabled()) return await readUsersFromBlob();
    return await readUsersFromFile();
}

async function writeUsers(fileUsers: User[]): Promise<void> {
    if (isDbEnabled()) return await writeUsersToDb(fileUsers);
    if (isBlobEnabled()) return await writeUsersToBlob(fileUsers);
    return await writeUsersToFile(fileUsers);
}

// PostgreSQL helpers
async function ensureUsersTable(): Promise<void> {
    await sql`
        CREATE TABLE IF NOT EXISTS users (
            id SERIAL PRIMARY KEY,
            name TEXT NOT NULL,
            email TEXT NOT NULL
        );
    `;
}

async function readUsersFromDb(): Promise<User[]> {
    await ensureUsersTable();
    const { rows } = await sql`SELECT id, name, email FROM users ORDER BY id ASC`;
    return rows as unknown as User[];
}

async function writeUsersToDb(fileUsers: User[]): Promise<void> {
    await ensureUsersTable();
    // Upsert full snapshot: simple approach for this demo.
    await sql`TRUNCATE TABLE users RESTART IDENTITY;`;
    for (const u of fileUsers) {
        await sql`INSERT INTO users (name, email) VALUES (${u.name}, ${u.email});`;
    }
}

async function renderHome(res: Response, locals?: Record<string, unknown>): Promise<void> {
    const fileUsers = await readUsers();
    res.render('index', { users: fileUsers, ...(locals || {}) });
}

// Health Check
app.get('/api/health', (req: Request, res: Response) => {
    res.json({ status: 'ok', uptime: process.uptime(), timestamp: new Date().toISOString() });
});

// In-memory Users Store
const users: User[] = [
    { id: 1, name: 'Alice', email: 'alice@example.com' },
    { id: 2, name: 'Bob', email: 'bob@example.com' }
];
let nextUserId = 3;

// Users - List
app.get('/api/users', (req: Request, res: Response) => {
    res.json(users);
});

// File-backed Users - List
app.get('/api/users-file', async (req: Request, res: Response) => {
    try {
        const fileUsers = await readUsers();
        res.json(fileUsers);
    } catch (e) {
        res.status(500).json({ error: 'Failed to read users' });
    }
});

// Users - Get by ID
app.get('/api/users/:id', (req: Request, res: Response) => {
    const id = Number(req.params.id);
    const user = users.find(u => u.id === id);
    if (!user) {
        return res.status(404).json({ error: 'User not found' });
    }
    res.json(user);
});

// Users - Create
app.post('/api/users', (req: Request<unknown, unknown, Partial<User>>, res: Response) => {
    const { name, email } = req.body || {};
    if (!name || !email) {
        return res.status(400).json({ error: 'name and email are required' });
    }
    const newUser: User = { id: nextUserId++, name, email };
    users.push(newUser);
    res.status(201).json(newUser);
});

// Render Create User Form
app.get('/users/new', (req: Request, res: Response) => {
    res.render('new-user');
});

// Handle Create User (Form) -> Save to JSON file
app.post('/users', async (req: Request, res: Response) => {
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
        const newUser: User = { id: nextId, name, email };
        currentUsers.push(newUser);
        await writeUsers(currentUsers);
        return res.redirect('/');
    } catch (e) {
        console.error(e);
        res.status(500);
        await renderHome(res, { error: 'Failed to save user. Please try again.', name, email });
        return;
    }
});

// Users - Update (PUT)
app.put('/api/users/:id', (req: Request<{ id: string }, unknown, Partial<User>>, res: Response) => {
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

// Users - Delete
app.delete('/api/users/:id', (req: Request, res: Response) => {
    const id = Number(req.params.id);
    const index = users.findIndex(u => u.id === id);
    if (index === -1) {
        return res.status(404).json({ error: 'User not found' });
    }
    users.splice(index, 1);
    res.status(204).send();
});

// 404 handler
app.use((req: Request, res: Response) => {
    res.status(404).json({ error: 'Not Found' });
});

// Error handler
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
    console.error(err);
    res.status(500).json({ error: 'Internal Server Error' });
});

// For local development
if (process.env.NODE_ENV !== 'production') {
    app.listen(PORT, () => {
        console.log(`Server running on http://localhost:${PORT}`);
    });
}

// Export the Express app for Vercel
export default app;
