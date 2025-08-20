import express, { Request, Response, NextFunction } from 'express';
import path from 'path';
import fs from 'fs';
import fsPromises from 'fs/promises';

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

// File-based storage helpers
const dataDir = path.join(__dirname, 'data');
const dataFile = path.join(dataDir, 'users.json');

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

async function renderHome(res: Response, locals?: Record<string, unknown>): Promise<void> {
    const fileUsers = await readUsersFromFile();
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
        const fileUsers = await readUsersFromFile();
        res.json(fileUsers);
    } catch (e) {
        res.status(500).json({ error: 'Failed to read users from file' });
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
        const fileUsers = await readUsersFromFile();
        const nextId = fileUsers.reduce((max, u) => (u.id > max ? u.id : max), 0) + 1;
        const newUser: User = { id: nextId, name, email };
        fileUsers.push(newUser);
        await writeUsersToFile(fileUsers);
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
