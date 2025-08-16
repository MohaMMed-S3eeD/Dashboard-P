import express, { Request, Response, NextFunction } from 'express';

const app = express();
const PORT = process.env.PORT || 3000;

// Middlewares
app.use(express.json());

app.get('/', (req, res) => {
    res.send('Demo API is running');
});

// Health Check
app.get('/api/health', (req: Request, res: Response) => {
    res.json({ status: 'ok', uptime: process.uptime(), timestamp: new Date().toISOString() });
});

// In-memory Users Store
type User = { id: number; name: string; email: string };
const users: User[] = [
    { id: 1, name: 'Alice', email: 'alice@example.com' },
    { id: 2, name: 'Bob', email: 'bob@example.com' }
];
let nextUserId = 3;

// Users - List
app.get('/api/users', (req: Request, res: Response) => {
    res.json(users);
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

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});

// Export the Express app for Vercel
export default app;
