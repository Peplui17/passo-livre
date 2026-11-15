const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../db');

const router = express.Router();

// Função auxiliar para gerar o token
function signToken(user) {
  return jwt.sign(
    { id: user.id, email: user.email }, 
    process.env.JWT_SECRET, 
    { expiresIn: '7d' } // Token válido por 7 dias
  );
}

// --- ROTA DE CADASTRO ---
router.post('/register', async (req, res) => {
  const { name, email, password, mobility_profile } = req.body;
  
  if (!name || !email || !password) {
    return res.status(400).json({ error: 'Nome, e-mail e senha são obrigatórios.' });
  }

  try {
    // Criptografa a senha (10 rounds de salt)
    const hash = await bcrypt.hash(password, 10);
    
    const { rows } = await pool.query(
      `INSERT INTO users (name, email, password_hash, mobility_profile)
       VALUES ($1, $2, $3, $4) 
       RETURNING id, name, email, mobility_profile`,
      [name, email, hash, mobility_profile || 'general']
    );
    
    const user = rows[0];
    res.status(201).json({ 
      message: 'Usuário criado com sucesso!', 
      token: signToken(user), 
      user 
    });
  } catch (e) {
    // Código 23505 no PostgreSQL significa "Unique Violation" (e-mail já existe)
    if (e.code === '23505') {
      return res.status(409).json({ error: 'Este e-mail já está cadastrado.' });
    }
    console.error(e);
    res.status(500).json({ error: 'Erro interno no servidor.' });
  }
});

// --- ROTA DE LOGIN ---
router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'E-mail e senha são obrigatórios.' });
  }

  try {
    const { rows } = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    const user = rows[0];

    if (!user) {
      return res.status(401).json({ error: 'Credenciais inválidas.' });
    }

    // Compara a senha digitada com o hash salvo no banco
    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      return res.status(401).json({ error: 'Credenciais inválidas.' });
    }

    // Não retornamos o password_hash por segurança
    res.json({
      message: 'Login realizado com sucesso!',
      token: signToken(user),
      user: { 
        id: user.id, 
        name: user.name, 
        email: user.email, 
        mobility_profile: user.mobility_profile 
      }
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Erro interno no servidor.' });
  }
});

module.exports = router;