const express = require('express');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname)));

const db = new sqlite3.Database(path.join(__dirname, 'database.sqlite'));

function generateDuoCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS duos (
      id TEXT PRIMARY KEY,
      code TEXT UNIQUE NOT NULL,
      createdAt TEXT NOT NULL
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      fullName TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      duoId TEXT,
      duoCode TEXT,
      FOREIGN KEY(duoId) REFERENCES duos(id)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS sorties (
      id TEXT PRIMARY KEY,
      duoId TEXT,
      userId TEXT NOT NULL,
      userEmail TEXT NOT NULL,
      type TEXT NOT NULL,
      dates TEXT NOT NULL,
      comment TEXT,
      status TEXT NOT NULL,
      createdAt TEXT NOT NULL
    )
  `);
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'register.html'));
});

app.post('/api/users', (req, res) => {
  const { fullName, email, password, duoCode } = req.body;

  if (!fullName || !email || !password) {
    return res.status(400).json({ error: 'Champs manquants' });
  }

  const userId = crypto.randomUUID();

  db.get('SELECT * FROM users WHERE email = ?', [email], (err, row) => {
    if (err) return res.status(500).json({ error: 'Erreur DB' });

    if (row) {
      return res.status(409).json({ error: 'Utilisateur déjà existant' });
    }

    let duoId = null;
    let finalDuoCode = duoCode || null;

    const createUser = (resolvedDuoId, resolvedDuoCode) => {
      db.run(
        'INSERT INTO users (id, fullName, email, password, duoId, duoCode) VALUES (?, ?, ?, ?, ?, ?)',
        [userId, fullName, email, password, resolvedDuoId, resolvedDuoCode],
        (insertErr) => {
          if (insertErr) {
            return res.status(500).json({ error: 'Erreur insertion' });
          }

          return res.status(201).json({
            user: {
              id: userId,
              fullName,
              email,
              duoId: resolvedDuoId,
              duoCode: resolvedDuoCode
            }
          });
        }
      );
    };

    if (duoCode && duoCode.trim()) {
      db.get('SELECT * FROM duos WHERE code = ?', [duoCode.trim().toUpperCase()], (duoErr, duo) => {
        if (duoErr) return res.status(500).json({ error: 'Erreur DB' });

        if (!duo) {
          return res.status(404).json({ error: 'Code duo introuvable' });
        }

        duoId = duo.id;
        finalDuoCode = duo.code;
        createUser(duoId, finalDuoCode);
      });
    } else {
      const newDuoId = crypto.randomUUID();
      const newCode = generateDuoCode();

      db.run(
        'INSERT INTO duos (id, code, createdAt) VALUES (?, ?, ?)',
        [newDuoId, newCode, new Date().toISOString()],
        (duoInsertErr) => {
          if (duoInsertErr) return res.status(500).json({ error: 'Erreur création duo' });
          duoId = newDuoId;
          finalDuoCode = newCode;
          createUser(duoId, finalDuoCode);
        }
      );
    }
  });
});

app.post('/api/login', (req, res) => {
  const { email, password } = req.body;

  db.get(
    'SELECT * FROM users WHERE email = ? AND password = ?',
    [email, password],
    (err, user) => {
      if (err) return res.status(500).json({ error: 'Erreur DB' });
      if (!user) return res.status(401).json({ error: 'Identifiants invalides' });

      return res.json({
        user: {
          id: user.id,
          fullName: user.fullName,
          email: user.email,
          duoId: user.duoId,
          duoCode: user.duoCode
        }
      });
    }
  );
});

app.post('/api/sorties', (req, res) => {
  const { duoId, userId, userEmail, type, dates, comment, status, createdAt } = req.body;

  if (!duoId || !userId || !userEmail || !type || !Array.isArray(dates)) {
    return res.status(400).json({ error: 'Données invalides' });
  }

  const id = crypto.randomUUID();

  db.run(
    'INSERT INTO sorties (id, duoId, userId, userEmail, type, dates, comment, status, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [id, duoId, userId, userEmail, type, JSON.stringify(dates), comment || '', status || 'pending', createdAt || new Date().toISOString()],
    (err) => {
      if (err) return res.status(500).json({ error: 'Erreur insertion' });

      return res.status(201).json({ success: true, id });
    }
  );
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Serveur lancé sur http://localhost:${PORT}`);
});