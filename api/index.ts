import express from 'express';
import api from '../src/server/api.js';

const app = express();

app.use('/api', api);
app.use('/uniaopet/api', api);
app.use('/', api);

export default app;
