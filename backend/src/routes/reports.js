const express = require('express');
const pool = require('../db');
const auth = require('../middleware/auth');

const router = express.Router();

// --- 1. LISTAR REPORTES PRÓXIMOS (Público, mas se logado, melhor) ---
router.get('/nearby', auth(false), async (req, res) => {
  const { lat, lng, radius = 2000 } = req.query; // Radius em metros (padrão 2km)

  if (!lat || !lng) {
    return res.status(400).json({ error: 'Latitude (lat) e Longitude (lng) são obrigatórios.' });
  }

  try {
    // ST_DWithin: Função do PostGIS que calcula distância entre dois pontos geográficos
    // ST_MakePoint: Cria um ponto geográfico a partir das coordenadas
    // ST_Y e ST_X: Extraem lat e lng de volta para o formato JSON legível
    const { rows } = await pool.query(
      `SELECT id, obstacle_type, severity, description, status, confirmations,
              ST_Y(location::geometry) AS lat, 
              ST_X(location::geometry) AS lng, 
              created_at
       FROM reports
       WHERE ST_DWithin(location, ST_MakePoint($1, $2)::geography, $3)
       ORDER BY created_at DESC LIMIT 500`,
      [Number(lng), Number(lat), Number(radius)]
    );
    res.json(rows);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Erro ao buscar reportes.' });
  }
});

// --- 2. CRIAR UM NOVO REPORTE (Requer Login) ---
router.post('/', auth(true), async (req, res) => {
  const { obstacle_type, severity, description, lat, lng } = req.body;

  if (!obstacle_type || !severity || !lat || !lng) {
    return res.status(400).json({ error: 'Tipo, severidade, latitude e longitude são obrigatórios.' });
  }

  try {
    const { rows } = await pool.query(
      `INSERT INTO reports (user_id, obstacle_type, severity, description, location)
       VALUES ($1, $2, $3, $4, ST_MakePoint($5, $6)::geography)
       RETURNING id, obstacle_type, severity, description, status, confirmations,
                 ST_Y(location::geometry) AS lat, 
                 ST_X(location::geometry) AS lng, 
                 created_at`,
      [req.user.id, obstacle_type, Number(severity), description || null, Number(lng), Number(lat)]
    );
    res.status(201).json(rows[0]);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Erro ao criar reporte.' });
  }
});

// --- 3. VERIFICAR REPORTE (Confirmar ou Contestar - Requer Login) ---
router.post('/:id/verify', auth(true), async (req, res) => {
  const reportId = Number(req.params.id);
  const { confirmed } = req.body; // true = confirmar, false = contestar

  if (typeof confirmed !== 'boolean') {
    return res.status(400).json({ error: 'O campo "confirmed" deve ser true ou false.' });
  }


   const reportCheck = await pool.query('SELECT user_id FROM reports WHERE id = $1', [reportId]);
   if (reportCheck.rows[0].user_id === req.user.id) return res.status(400).json({error: 'Você não pode validar seu próprio reporte.'});

  const client = await pool.connect();
  try {
    await client.query('BEGIN'); // Inicia transação

    // Insere ou atualiza a verificação
    await client.query(
      `INSERT INTO verifications (report_id, user_id, confirmed) 
       VALUES ($1, $2, $3)
       ON CONFLICT (report_id, user_id) DO UPDATE SET confirmed = EXCLUDED.confirmed`,
      [reportId, req.user.id, confirmed]
    );

    // Atualiza a tabela de reportes com a contagem e o status
    const { rows } = await client.query(
      `UPDATE reports SET
         confirmations = (SELECT COUNT(*) FROM verifications WHERE report_id = $1 AND confirmed = true),
         status = CASE
           WHEN (SELECT COUNT(*) FROM verifications WHERE report_id = $1 AND confirmed = true) >= 3 THEN 'verified'
           WHEN (SELECT COUNT(*) FROM verifications WHERE report_id = $1 AND confirmed = false) >= 3 THEN 'rejected'
           ELSE status 
         END,
         updated_at = NOW()
       WHERE id = $1
       RETURNING id, status, confirmations`,
      [reportId]
    );

    await client.query('COMMIT'); // Salva as alterações
    res.json({ message: 'Verificação registrada!', report: rows[0] });
  } catch (e) {
    await client.query('ROLLBACK'); // Desfaz se der erro
    console.error(e);
    res.status(500).json({ error: 'Erro ao verificar reporte.' });
  } finally {
    client.release(); // Devolve a conexão para o pool
  }
});

module.exports = router;