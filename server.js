const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000;

app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', project: 'digital-footprint' });
});

app.get('/', (req, res) => {
  res.type('text/plain').send('Digital Footprint — каркас. См. /health и DOSSIER.md');
});

app.listen(PORT, () => {
  console.log(`[server] listening on ${PORT}`);
});