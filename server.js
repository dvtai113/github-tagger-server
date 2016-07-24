import express from 'express';
import http from 'http';

const app = new express();
app.get('/', (req, res) => {
  res.send('hi there');
});

const port = process.env.PORT || 3333;

app.listen(port, () => {
  console.log(`🐶  server runs on port ${port}`);
});
