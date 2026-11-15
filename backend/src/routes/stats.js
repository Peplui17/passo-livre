const express = require('express');
const pool = require('../db');

const router = express.Router();

// GET /api/stats
router.get('/', async (req, res) => {
  try {
    // Executa várias queries em paralelo para ser mais rápido
    const [byType, bySeverity, totals, byStatus] = await Promise.all([
      // 1. Contagem por tipo de obstáculo e severidade média
      pool.query(`SELECT obstacle_type, COUNT(*)::int AS count, ROUND(AVG(severity)::numeric, 2) AS avg_severity 
                  FROM reports 
                  GROUP BY obstacle_type 
                  ORDER BY count DESC`),
      
      // 2. Contagem por nota de severidade (1 a 5)
      pool.query(`SELECT severity, COUNT(*)::int AS count 
                  FROM reports 
                  GROUP BY severity 
                  ORDER BY severity`),
      
      // 3. Totais gerais (total de reportes, usuários ativos, média geral)
      pool.query(`SELECT COUNT(*)::int AS total_reports, 
                         COUNT(DISTINCT user_id)::int AS active_users,
                         ROUND(AVG(severity)::numeric, 2) AS avg_severity
                  FROM reports`),
      
      // 4. Contagem por status (pendentes, verificados, rejeitados)
      pool.query(`SELECT status, COUNT(*)::int AS count 
                  FROM reports 
                  GROUP BY status`)
    ]);

    res.json({
      totals: totals.rows[0],
      byType: byType.rows,
      bySeverity: bySeverity.rows,
      byStatus: byStatus.rows
    });

  } catch (e) {
    console.error('Erro nas estatísticas:', e);
    res.status(500).json({ error: 'Erro ao buscar estatísticas.' });
  }
});

module.exports = router;