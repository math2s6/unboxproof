function errorHandler(err, req, res, next) {
  console.error(err);
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ error: 'Fichier trop volumineux' });
  }
  res.status(err.status || 500).json({ error: err.message || 'Erreur serveur' });
}

module.exports = errorHandler;
