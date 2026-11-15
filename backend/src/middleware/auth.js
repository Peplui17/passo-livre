const jwt = require('jsonwebtoken');


function auth(required = true) {
  return (req, res, next) => {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;

    if (!token) {
      if (!required) return next(); // Se não for obrigatório, segue viagem sem usuário
      return res.status(401).json({ error: 'Acesso negado. Token não fornecido.' });
    }

    try {
      // Verifica se o token é válido e não expirou
      req.user = jwt.verify(token, process.env.JWT_SECRET);
      next(); // Tudo certo, passa para a próxima função
    } catch {
      return res.status(401).json({ error: 'Token inválido ou expirado.' });
    }
  };
}

module.exports = auth;