require('dotenv').config();
const express = require('express');
const cors = require('cors');

const app = express();

app.use(cors());
app.use(express.json({ limit: '2mb' }));

// Rotas da API
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'API Passo Livre está rodando!' });
});

app.use('/api/auth', require('./routes/auth'));
app.use('/api/reports', require('./routes/reports'));
app.use('/api/routes', require('./routes/routes'));
app.use('/api/stats', require('./routes/stats'));    

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`🚀 Servidor rodando em http://localhost:${port}`);
});