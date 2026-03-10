const router = require('express').Router();

router.post('/', (req, res) => {
  const { firstname, lastname, email, company, sector, volume, message } = req.body;
  console.log(`📞 Demande de démo: ${firstname} ${lastname} (${company}) — ${email} — ${volume} commandes/mois`);
  res.json({ message: 'Demande reçue ! Nous vous recontacterons dans les 24h.' });
});

module.exports = router;
