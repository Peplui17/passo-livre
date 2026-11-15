const express = require('express');
const pool = require('../db');
const auth = require('../middleware/auth');

const router = express.Router();

// POST /api/routes/score
router.post('/score', auth(false), async (req, res) => {
  const { waypoints, mobility_profile } = req.body;

  // Validação básica
  if (!Array.isArray(waypoints) || waypoints.length < 2) {
    return res.status(400).json({ error: 'waypoints deve ser um array com pelo menos 2 coordenadas [lat, lng].' });
  }

  try {
    // 1. Monta uma LINESTRING do PostGIS com os pontos da rota
    const wktCoords = waypoints.map(p => `${p[1]} ${p[0]}`).join(', ');
    const wkt = `LINESTRING(${wktCoords})`;

    // 2. Busca obstáculos num raio de 40 metros da rota
    const { rows: obstacles } = await pool.query(
      `SELECT id, obstacle_type, severity, description,
              ST_Y(location::geometry) AS lat, ST_X(location::geometry) AS lng,
              ST_Distance(location, ST_GeogFromText('SRID=4326;' || $1)) AS distance_m
       FROM reports
       WHERE status <> 'rejected'
         AND ST_DWithin(location, ST_GeogFromText('SRID=4326;' || $1), 40)
       ORDER BY severity DESC`,
      [wkt]
    );

    // 3. Calcula a distância total da rota
    const { rows: lengthRes } = await pool.query(
      `SELECT ST_Length(ST_GeogFromText('SRID=4326;' || $1)) AS distance_m`, 
      [wkt]
    );

    // 4. Calcula o Score (100 menos a soma das severidades dos obstáculos)
    let penalty = 0;
    for (const obs of obstacles) {
      penalty += obs.severity;
    }
    const score = Math.max(0, Math.round(100 - penalty));

    // 5. Retorna a resposta formatada
    res.json({
      score,
      distance_m: Number(lengthRes[0].distance_m),
      reports_nearby: obstacles,
      mobility_profile: mobility_profile || 'general',
      message: score >= 75 ? 'Rota boa e acessível!' : score >= 45 ? 'Atenção: Rota com obstáculos.' : 'Rota crítica. Evite se possível.'
    });

  } catch (e) {
    console.error('Erro no cálculo da rota:', e);
    res.status(500).json({ error: 'Erro ao calcular o score da rota.' });
  }
});

module.exports = router;