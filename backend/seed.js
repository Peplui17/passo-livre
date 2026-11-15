require('dotenv').config();
const bcrypt = require('bcryptjs');
const pool = require('./src/db');

(async () => {
  try {
    console.log('Iniciando seed...');
    const hash = await bcrypt.hash('senha123', 10);
    
    // 1. Inserir usuários
    const users = [
      ['Ana Cadeirante', 'ana@example.com', 'wheelchair'],
      ['João Idoso', 'joao@example.com', 'elderly'],
      ['Maria Cuidadora', 'maria@example.com', 'general']
    ];
    
    for (const [name, email, profile] of users) {
      await pool.query(
        `INSERT INTO users (name, email, password_hash, mobility_profile)
         VALUES ($1,$2,$3,$4) ON CONFLICT (email) DO NOTHING`,
        [name, email, hash, profile]
      );
    }
    console.log('✅ Usuários criados.');

    // 2. Pegar o ID da Ana para associar aos reportes
    const { rows } = await pool.query(`SELECT id FROM users WHERE email='ana@example.com'`);
    const userId = rows[0].id;

    // 3. Inserir reportes (coordenadas próximas à Av. Paulista, SP)
    const reports = [
      ['irregular_sidewalk', 4, 'Calçada quebrada perto da praça', -23.5505, -46.6333],
      ['missing_ramp', 5, 'Sem rampa na esquina', -23.5512, -46.6340],
      ['pothole', 3, 'Buraco grande no meio da calçada', -23.5498, -46.6325],
      ['poor_lighting', 4, 'Iluminação ruim à noite', -23.5520, -46.6350],
      ['obstruction', 2, 'Entulho em frente ao prédio', -23.5501, -46.6338]
    ];
    
    for (const [type, sev, desc, lat, lng] of reports) {
      await pool.query(
        `INSERT INTO reports (user_id, obstacle_type, severity, description, location)
         VALUES ($1,$2,$3,$4, ST_MakePoint($5,$6)::geography)`,
        [userId, type, sev, desc, lng, lat]
      );
    }
    console.log('✅ Reportes criados.');
    console.log('Seed concluído com sucesso! Login demo: ana@example.com / senha123');
  } catch (error) {
    console.error('❌ Erro no seed:', error);
  } finally {
    await pool.end();
  }
})();