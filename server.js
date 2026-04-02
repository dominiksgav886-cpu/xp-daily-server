import express from 'express';
import cors from 'cors';
import jwt from 'jsonwebtoken';
import bcryptjs from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { initDatabase, getDatabase, closeDatabase } from './database.js';

const app = express();
const PORT = process.env.PORT || 3001;
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

// Middleware
app.use(cors());
app.use(express.json());

// Auth middleware
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'No token provided' });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Invalid token' });
    }
    req.userId = user.id;
    next();
  });
};

// Initialize database on startup
await initDatabase();

// AUTH ROUTES
app.post('/api/auth/signup', async (req, res) => {
  try {
    const { email, username, password } = req.body;

    if (!email || !username || !password) {
      return res.status(400).json({ error: 'Email, username, and password required' });
    }

    const db = getDatabase();

    // Check if user exists
    const existing = await db.get(
      'SELECT id FROM users WHERE email = ? OR username = ?',
      [email, username]
    );

    if (existing) {
      return res.status(409).json({ error: 'Email or username already exists' });
    }

    const id = uuidv4();
    const hashedPassword = await bcryptjs.hash(password, 10);

    await db.run(
      'INSERT INTO users (id, email, username, password) VALUES (?, ?, ?, ?)',
      [id, email, username, hashedPassword]
    );

    const token = jwt.sign({ id, email }, JWT_SECRET, { expiresIn: '7d' });

    res.json({
      token,
      user: {
        id,
        email,
        username,
        level: 1,
        xp: 0,
        coins: 0
      }
    });
  } catch (error) {
    console.error('Signup error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/auth/signin', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' });
    }

    const db = getDatabase();

    const user = await db.get(
      'SELECT id, email, username, password, level, xp, coins FROM users WHERE email = ?',
      [email]
    );

    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const passwordMatch = await bcryptjs.compare(password, user.password);

    if (!passwordMatch) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const token = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: '7d' });

    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        level: user.level,
        xp: user.xp,
        coins: user.coins
      }
    });
  } catch (error) {
    console.error('Signin error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/auth/me', authenticateToken, async (req, res) => {
  try {
    const db = getDatabase();
    const user = await db.get(
      'SELECT id, email, username, level, xp, coins FROM users WHERE id = ?',
      [req.userId]
    );

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json(user);
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.patch('/api/auth/me', authenticateToken, async (req, res) => {
  try {
    const db = getDatabase();
    const { username, level, xp, coins } = req.body;

    let updateFields = [];
    let updateValues = [];

    if (username !== undefined) {
      updateFields.push('username = ?');
      updateValues.push(username);
    }
    if (level !== undefined) {
      updateFields.push('level = ?');
      updateValues.push(level);
    }
    if (xp !== undefined) {
      updateFields.push('xp = ?');
      updateValues.push(xp);
    }
    if (coins !== undefined) {
      updateFields.push('coins = ?');
      updateValues.push(coins);
    }

    if (updateFields.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    updateValues.push(req.userId);

    await db.run(
      `UPDATE users SET ${updateFields.join(', ')} WHERE id = ?`,
      updateValues
    );

    const user = await db.get(
      'SELECT id, email, username, level, xp, coins FROM users WHERE id = ?',
      [req.userId]
    );

    res.json(user);
  } catch (error) {
    console.error('Update user error:', error);
    res.status(500).json({ error: error.message });
  }
});

// TASKS ROUTES
app.get('/api/tasks', authenticateToken, async (req, res) => {
  try {
    const db = getDatabase();
    const sort = req.query.sort || 'created_date';
    const limit = req.query.limit || 100;

    const tasks = await db.all(
      `SELECT * FROM tasks WHERE user_id = ? ORDER BY ${sort} LIMIT ?`,
      [req.userId, limit]
    );

    res.json(tasks);
  } catch (error) {
    console.error('Get tasks error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/tasks', authenticateToken, async (req, res) => {
  try {
    const db = getDatabase();
    const { title, description, scheduled_time, xp_reward, coin_reward, icon, difficulty } = req.body;

    const id = uuidv4();

    await db.run(
      `INSERT INTO tasks (id, user_id, title, description, scheduled_time, xp_reward, coin_reward, icon, difficulty)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, req.userId, title, description, scheduled_time, xp_reward || 25, coin_reward || 10, icon || 'sword', difficulty || 'medium']
    );

    const task = await db.get('SELECT * FROM tasks WHERE id = ?', [id]);
    res.status(201).json(task);
  } catch (error) {
    console.error('Create task error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.patch('/api/tasks/:id', authenticateToken, async (req, res) => {
  try {
    const db = getDatabase();
    const { title, description, scheduled_time, xp_reward, coin_reward, is_completed, completion_date, icon, difficulty } = req.body;

    const task = await db.get('SELECT * FROM tasks WHERE id = ? AND user_id = ?', [req.params.id, req.userId]);

    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }

    let updateFields = [];
    let updateValues = [];

    if (title !== undefined) {
      updateFields.push('title = ?');
      updateValues.push(title);
    }
    if (description !== undefined) {
      updateFields.push('description = ?');
      updateValues.push(description);
    }
    if (scheduled_time !== undefined) {
      updateFields.push('scheduled_time = ?');
      updateValues.push(scheduled_time);
    }
    if (xp_reward !== undefined) {
      updateFields.push('xp_reward = ?');
      updateValues.push(xp_reward);
    }
    if (coin_reward !== undefined) {
      updateFields.push('coin_reward = ?');
      updateValues.push(coin_reward);
    }
    if (is_completed !== undefined) {
      updateFields.push('is_completed = ?');
      updateValues.push(is_completed);
    }
    if (completion_date !== undefined) {
      updateFields.push('completion_date = ?');
      updateValues.push(completion_date);
    }
    if (icon !== undefined) {
      updateFields.push('icon = ?');
      updateValues.push(icon);
    }
    if (difficulty !== undefined) {
      updateFields.push('difficulty = ?');
      updateValues.push(difficulty);
    }

    if (updateFields.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    updateValues.push(req.params.id);

    await db.run(
      `UPDATE tasks SET ${updateFields.join(', ')} WHERE id = ?`,
      updateValues
    );

    const updated = await db.get('SELECT * FROM tasks WHERE id = ?', [req.params.id]);
    res.json(updated);
  } catch (error) {
    console.error('Update task error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/tasks/:id', authenticateToken, async (req, res) => {
  try {
    const db = getDatabase();

    const task = await db.get('SELECT * FROM tasks WHERE id = ? AND user_id = ?', [req.params.id, req.userId]);

    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }

    await db.run('DELETE FROM tasks WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (error) {
    console.error('Delete task error:', error);
    res.status(500).json({ error: error.message });
  }
});

// QUESTS ROUTES
app.get('/api/quests', authenticateToken, async (req, res) => {
  try {
    const db = getDatabase();
    const sort = req.query.sort || 'created_date';
    const limit = req.query.limit || 100;

    const quests = await db.all(
      `SELECT * FROM quests WHERE user_id = ? ORDER BY ${sort} LIMIT ?`,
      [req.userId, limit]
    );

    res.json(quests);
  } catch (error) {
    console.error('Get quests error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/quests', authenticateToken, async (req, res) => {
  try {
    const db = getDatabase();
    const { title, description, xp_reward, coin_reward, difficulty, quest_type } = req.body;

    const id = uuidv4();

    await db.run(
      `INSERT INTO quests (id, user_id, title, description, xp_reward, coin_reward, difficulty, quest_type)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, req.userId, title, description, xp_reward || 50, coin_reward || 25, difficulty || 'medium', quest_type || 'daily']
    );

    const quest = await db.get('SELECT * FROM quests WHERE id = ?', [id]);
    res.status(201).json(quest);
  } catch (error) {
    console.error('Create quest error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.patch('/api/quests/:id', authenticateToken, async (req, res) => {
  try {
    const db = getDatabase();
    const { title, description, xp_reward, coin_reward, is_completed, completion_date, difficulty, quest_type } = req.body;

    const quest = await db.get('SELECT * FROM quests WHERE id = ? AND user_id = ?', [req.params.id, req.userId]);

    if (!quest) {
      return res.status(404).json({ error: 'Quest not found' });
    }

    let updateFields = [];
    let updateValues = [];

    if (title !== undefined) updateFields.push('title = ?'), updateValues.push(title);
    if (description !== undefined) updateFields.push('description = ?'), updateValues.push(description);
    if (xp_reward !== undefined) updateFields.push('xp_reward = ?'), updateValues.push(xp_reward);
    if (coin_reward !== undefined) updateFields.push('coin_reward = ?'), updateValues.push(coin_reward);
    if (is_completed !== undefined) updateFields.push('is_completed = ?'), updateValues.push(is_completed);
    if (completion_date !== undefined) updateFields.push('completion_date = ?'), updateValues.push(completion_date);
    if (difficulty !== undefined) updateFields.push('difficulty = ?'), updateValues.push(difficulty);
    if (quest_type !== undefined) updateFields.push('quest_type = ?'), updateValues.push(quest_type);

    if (updateFields.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    updateValues.push(req.params.id);

    await db.run(
      `UPDATE quests SET ${updateFields.join(', ')} WHERE id = ?`,
      updateValues
    );

    const updated = await db.get('SELECT * FROM quests WHERE id = ?', [req.params.id]);
    res.json(updated);
  } catch (error) {
    console.error('Update quest error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/quests/:id', authenticateToken, async (req, res) => {
  try {
    const db = getDatabase();

    const quest = await db.get('SELECT * FROM quests WHERE id = ? AND user_id = ?', [req.params.id, req.userId]);

    if (!quest) {
      return res.status(404).json({ error: 'Quest not found' });
    }

    await db.run('DELETE FROM quests WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (error) {
    console.error('Delete quest error:', error);
    res.status(500).json({ error: error.message });
  }
});

// SHOP ITEMS ROUTES
app.get('/api/shop', authenticateToken, async (req, res) => {
  try {
    const db = getDatabase();
    const items = await db.all('SELECT * FROM shop_items WHERE user_id = ?', [req.userId]);
    res.json(items);
  } catch (error) {
    console.error('Get shop items error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/shop', authenticateToken, async (req, res) => {
  try {
    const db = getDatabase();
    const { name, description, price, category, icon, rarity } = req.body;

    const id = uuidv4();

    await db.run(
      `INSERT INTO shop_items (id, user_id, name, description, price, category, icon, rarity)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, req.userId, name, description, price, category || 'perk', icon || 'gift', rarity || 'common']
    );

    const item = await db.get('SELECT * FROM shop_items WHERE id = ?', [id]);
    res.status(201).json(item);
  } catch (error) {
    console.error('Create shop item error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.patch('/api/shop/:id', authenticateToken, async (req, res) => {
  try {
    const db = getDatabase();
    const { name, description, price, category, icon, is_purchased, rarity } = req.body;

    const item = await db.get('SELECT * FROM shop_items WHERE id = ? AND user_id = ?', [req.params.id, req.userId]);

    if (!item) {
      return res.status(404).json({ error: 'Shop item not found' });
    }

    let updateFields = [];
    let updateValues = [];

    if (name !== undefined) updateFields.push('name = ?'), updateValues.push(name);
    if (description !== undefined) updateFields.push('description = ?'), updateValues.push(description);
    if (price !== undefined) updateFields.push('price = ?'), updateValues.push(price);
    if (category !== undefined) updateFields.push('category = ?'), updateValues.push(category);
    if (icon !== undefined) updateFields.push('icon = ?'), updateValues.push(icon);
    if (is_purchased !== undefined) updateFields.push('is_purchased = ?'), updateValues.push(is_purchased);
    if (rarity !== undefined) updateFields.push('rarity = ?'), updateValues.push(rarity);

    if (updateFields.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    updateValues.push(req.params.id);

    await db.run(
      `UPDATE shop_items SET ${updateFields.join(', ')} WHERE id = ?`,
      updateValues
    );

    const updated = await db.get('SELECT * FROM shop_items WHERE id = ?', [req.params.id]);
    res.json(updated);
  } catch (error) {
    console.error('Update shop item error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/shop/:id', authenticateToken, async (req, res) => {
  try {
    const db = getDatabase();

    const item = await db.get('SELECT * FROM shop_items WHERE id = ? AND user_id = ?', [req.params.id, req.userId]);

    if (!item) {
      return res.status(404).json({ error: 'Shop item not found' });
    }

    await db.run('DELETE FROM shop_items WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (error) {
    console.error('Delete shop item error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ACHIEVEMENTS ROUTES
app.get('/api/achievements', authenticateToken, async (req, res) => {
  try {
    const db = getDatabase();
    const achievements = await db.all('SELECT * FROM achievements WHERE user_id = ?', [req.userId]);
    res.json(achievements);
  } catch (error) {
    console.error('Get achievements error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/achievements', authenticateToken, async (req, res) => {
  try {
    const db = getDatabase();
    const { title, description, icon } = req.body;

    const id = uuidv4();

    await db.run(
      `INSERT INTO achievements (id, user_id, title, description, icon)
       VALUES (?, ?, ?, ?, ?)`,
      [id, req.userId, title, description, icon]
    );

    const achievement = await db.get('SELECT * FROM achievements WHERE id = ?', [id]);
    res.status(201).json(achievement);
  } catch (error) {
    console.error('Create achievement error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.patch('/api/achievements/:id', authenticateToken, async (req, res) => {
  try {
    const db = getDatabase();
    const { title, description, icon, is_unlocked, unlock_date } = req.body;

    const achievement = await db.get('SELECT * FROM achievements WHERE id = ? AND user_id = ?', [req.params.id, req.userId]);

    if (!achievement) {
      return res.status(404).json({ error: 'Achievement not found' });
    }

    let updateFields = [];
    let updateValues = [];

    if (title !== undefined) updateFields.push('title = ?'), updateValues.push(title);
    if (description !== undefined) updateFields.push('description = ?'), updateValues.push(description);
    if (icon !== undefined) updateFields.push('icon = ?'), updateValues.push(icon);
    if (is_unlocked !== undefined) updateFields.push('is_unlocked = ?'), updateValues.push(is_unlocked);
    if (unlock_date !== undefined) updateFields.push('unlock_date = ?'), updateValues.push(unlock_date);

    if (updateFields.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    updateValues.push(req.params.id);

    await db.run(
      `UPDATE achievements SET ${updateFields.join(', ')} WHERE id = ?`,
      updateValues
    );

    const updated = await db.get('SELECT * FROM achievements WHERE id = ?', [req.params.id]);
    res.json(updated);
  } catch (error) {
    console.error('Update achievement error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/achievements/:id', authenticateToken, async (req, res) => {
  try {
    const db = getDatabase();

    const achievement = await db.get('SELECT * FROM achievements WHERE id = ? AND user_id = ?', [req.params.id, req.userId]);

    if (!achievement) {
      return res.status(404).json({ error: 'Achievement not found' });
    }

    await db.run('DELETE FROM achievements WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (error) {
    console.error('Delete achievement error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

process.on('SIGINT', async () => {
  console.log('Shutting down...');
  await closeDatabase();
  process.exit(0);
});
