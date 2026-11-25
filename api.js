import express from 'express';
import { db, initDb, exportDb, restoreDb, createBackup, getDbStats, listBackups } from './db.js';

initDb();

const api = express();
api.use(express.json());

function getAuthUserEmail(req) {
  const auth = req.headers['authorization'] || req.headers['x-user-email'];
  if (typeof auth === 'string' && auth.includes('@')) return auth;
  return req.body?.userEmail || req.query?.userEmail || null;
}

function trackUserPresence(req) {
  const email = getAuthUserEmail(req);
  if (email && db.updateUserLastSeen) {
    db.updateUserLastSeen(email);
  }
  return email;
}

api.use((req, _res, next) => {
  trackUserPresence(req);
  next();
});

api.get('/health', (req, res) => res.json({ status: 'ok', time: new Date().toISOString() }));

api.post('/users/me/heartbeat', (req, res) => {
  const email = trackUserPresence(req);
  if (!email) return res.status(401).json({ error: 'Não autenticado.' });
  res.json({ success: true, lastSeen: Date.now() });
});

// Posts
api.get('/posts', (req, res) => {
  const posts = db.getPosts();
  const postsWithComments = posts.map(post => ({
    ...post,
    comments: db.getCommentsByPostId(post.id)
  }));
  res.json(postsWithComments);
});

api.post('/posts', (req, res) => {
  const userEmail = getAuthUserEmail(req) || req.body.authorEmail || '';

  // Debounce guard against rapid duplicate submissions (within 10 seconds)
  const posts = db.getPosts();
  const title = (req.body.title || '').trim().toLowerCase();
  const petName = (req.body.petName || '').trim().toLowerCase();
  const tenSecondsAgo = Date.now() - 10000;

  const existing = posts.find((p) => {
    const sameAuthor = (p.authorEmail && p.authorEmail === userEmail) || (p.authorName && p.authorName === req.body.authorName);
    const sameTitle = (p.title || '').trim().toLowerCase() === title;
    const samePet = (p.petName || '').trim().toLowerCase() === petName;
    const isRecent = p.createdAt ? Date.parse(p.createdAt) > tenSecondsAgo : false;
    return sameAuthor && sameTitle && samePet && isRecent;
  });

  if (existing) {
    return res.status(200).json({ ...existing, likedByMe: false, comments: db.getCommentsByPostId(existing.id) });
  }

  const nowIso = new Date().toISOString();
  const newPost = {
    id: `post-${Date.now()}`,
    ...req.body,
    authorEmail: userEmail,
    date: req.body.date || nowIso,
    createdAt: nowIso
  };
  const created = db.insertPost(newPost);
  res.status(201).json({ ...created, comments: [] });
});

api.patch('/posts/:id/like', (req, res) => {
  const { id } = req.params;
  const { isLiked } = req.body;
  const post = db.getPostById(id);
  if (!post) return res.status(404).json({ error: 'Not found' });
  
  const updated = db.updatePost(id, { 
    likes: post.likes + (isLiked ? 1 : -1),
    likedByMe: isLiked
  });
  res.json(updated);
});

api.patch('/posts/:id/status', (req, res) => {
  const { id } = req.params;
  const { status } = req.body;
  const post = db.getPostById(id);
  if (!post) return res.status(404).json({ error: 'Not found' });
  const updated = db.togglePostStatus(id, status);
  res.json(updated);
});


api.delete('/posts/:id', (req, res) => {
  db.deletePost(req.params.id);
  res.status(204).send();
});

// Comments
api.post('/posts/:id/comments', (req, res) => {
  const newComment = {
    id: \`comment-\${Date.now()}\`,
    postId: req.params.id,
    ...req.body,
    createdAt: new Date().toISOString()
  };
  const created = db.insertComment(newComment);
  res.status(201).json(created);
});

// Conversations
api.get('/conversations', (req, res) => {
  const conversations = db.getConversations();
  const convsWithMessages = conversations.map(conv => ({
    ...conv,
    messages: db.getMessagesByConversationId(conv.id)
  }));
  res.json(convsWithMessages);
});

api.post('/conversations', (req, res) => {
  const newConv = {
    id: \`chat-\${Date.now()}\`,
    ...req.body,
    createdAt: new Date().toISOString()
  };
  const created = db.insertConversation(newConv);
  res.status(201).json({ ...created, messages: [] });
});

// Messages
api.post('/conversations/:id/messages', (req, res) => {
  const newMsg = {
    id: \`msg-\${Date.now()}\`,
    conversationId: req.params.id,
    ...req.body,
    createdAt: new Date().toISOString()
  };
  const created = db.insertMessage(newMsg);
  
  // Update last message in conversation
  db.updateConversation(req.params.id, {
    lastMessage: req.body.text,
    date: 'Agora'
  });
  
  res.status(201).json(created);
});

// Users and Following
api.get('/users', (req, res) => {
  let users = db.getUsers();
  if (req.query.q) {
    const q = req.query.q.toLowerCase();
    users = users.filter(u => u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q));
  }
  res.json(users);
});

api.get('/following', (req, res) => {
  const userEmail = getAuthUserEmail(req);
  if (!userEmail) return res.json([]);
  res.json(db.getFollowing(userEmail));
});

api.post('/users/:email/follow', (req, res) => {
  const userEmail = getAuthUserEmail(req);
  if (!userEmail) return res.status(400).json({ error: 'userEmail é obrigatório.' });
  db.insertFollowing(userEmail, req.params.email);
  res.status(201).json({ success: true });
});

api.delete('/users/:email/follow', (req, res) => {
  const userEmail = getAuthUserEmail(req);
  if (!userEmail) return res.status(400).json({ error: 'userEmail é obrigatório.' });
  db.removeFollowing(userEmail, req.params.email);
  res.status(204).send();
});

// Pets & Caderneta de Vacinação
api.get('/pets', (req, res) => {
  const userEmail = req.query.userEmail;
  if (!userEmail) return res.status(400).json({ error: 'userEmail é obrigatório.' });
  res.json(db.getPets(userEmail));
});

api.post('/pets', (req, res) => {
  const { name, species, breed, birthDate, gender, weight, avatar, microchip, ownerEmail } = req.body;
  if (!name) return res.status(400).json({ error: 'Nome é obrigatório.' });
  const newPet = {
    id: `pet-${Date.now()}`,
    ownerEmail: ownerEmail || '',
    name,
    species: species || 'dog',
    breed: breed || 'SRD',
    birthDate: birthDate || '',
    gender: gender || 'macho',
    weight: weight || '',
    avatar: avatar || '',
    microchip: microchip || '',
    vaccines: [],
    createdAt: new Date().toISOString()
  };
  const created = db.insertPet(newPet);
  res.status(201).json(created);
});

api.delete('/pets/:id', (req, res) => {
  db.deletePet(req.params.id);
  res.status(204).send();
});

api.post('/pets/:id/vaccines', (req, res) => {
  const { name, type, dateApplied, nextDueDate, veterinarian, clinic, batch, notes } = req.body;
  if (!name || !dateApplied) return res.status(400).json({ error: 'Nome e data obrigatórios.' });
  const newVaccine = {
    id: `vac-${Date.now()}`,
    name,
    type: type || 'vacina',
    dateApplied,
    nextDueDate: nextDueDate || '',
    veterinarian: veterinarian || '',
    clinic: clinic || '',
    batch: batch || '',
    notes: notes || '',
    status: 'em_dia'
  };
  const created = db.addVaccine(req.params.id, newVaccine);
  res.status(201).json(created);
});

api.delete('/pets/:id/vaccines/:vaccineId', (req, res) => {
  db.deleteVaccine(req.params.id, req.params.vaccineId);
  res.status(204).send();
});

// ── Pet Medications Endpoints ────────────────────────────────────────────────
api.post('/pets/:id/medications', (req, res) => {
  const { id } = req.params;
  const pet = db.getPetById(id);
  if (!pet) return res.status(404).json({ error: 'Pet não encontrado.' });
  const { name, dosage, frequency, startDate, endDate, notes } = req.body;
  if (!name || !dosage) return res.status(400).json({ error: 'Nome e dosagem são obrigatórios.' });

  const newMed = {
    id: `med-${Date.now()}`,
    petId: id,
    name,
    dosage,
    frequency: frequency || '1x ao dia',
    startDate: startDate || new Date().toISOString().split('T')[0],
    endDate: endDate || '',
    notes: notes || '',
    active: true,
    takenDates: [],
    createdAt: new Date().toISOString()
  };
  const created = db.addMedication(id, newMed);
  res.status(201).json(created);
});

api.patch('/pets/:id/medications/:medId', (req, res) => {
  const { id, medId } = req.params;
  const updated = db.updateMedication(id, medId, req.body);
  if (!updated) return res.status(404).json({ error: 'Medicamento não encontrado.' });
  res.json(updated);
});

api.delete('/pets/:id/medications/:medId', (req, res) => {
  const { id, medId } = req.params;
  const deleted = db.deleteMedication(id, medId);
  if (!deleted) return res.status(404).json({ error: 'Medicamento não encontrado.' });
  res.status(204).send();
});

api.post('/pets/:id/medications/:medId/toggle-taken', (req, res) => {
  const { id, medId } = req.params;
  const dateStr = req.body.date || new Date().toISOString().split('T')[0];
  const updated = db.toggleMedicationTaken(id, medId, dateStr);
  if (!updated) return res.status(404).json({ error: 'Medicamento não encontrado.' });
  res.json(updated);
});

// ── Pet Weight History Endpoints ─────────────────────────────────────────────
api.post('/pets/:id/weight', (req, res) => {
  const { id } = req.params;
  const pet = db.getPetById(id);
  if (!pet) return res.status(404).json({ error: 'Pet não encontrado.' });
  const { weightKg, date, notes } = req.body;
  if (typeof weightKg !== 'number' || isNaN(weightKg)) {
    return res.status(400).json({ error: 'Peso em kg inválido.' });
  }
  const record = {
    id: `wt-${Date.now()}`,
    petId: id,
    weightKg,
    date: date || new Date().toISOString().split('T')[0],
    notes: notes || ''
  };
  const created = db.addWeightRecord(id, record);
  res.status(201).json(created);
});

api.delete('/pets/:id/weight/:weightId', (req, res) => {
  const { id, weightId } = req.params;
  const deleted = db.deleteWeightRecord(id, weightId);
  if (!deleted) return res.status(404).json({ error: 'Registro não encontrado.' });
  res.status(204).send();
});

// ── Saved Posts (Bookmarks) Endpoints ────────────────────────────────────────
api.get('/users/me/saved-posts', (req, res) => {
  const email = getAuthUserEmail(req);
  if (!email) return res.status(401).json({ error: 'Não autenticado.' });
  const savedIds = db.getSavedPosts(email);
  res.json({ savedPosts: savedIds });
});

api.post('/users/me/saved-posts/:postId', (req, res) => {
  const email = getAuthUserEmail(req);
  if (!email) return res.status(401).json({ error: 'Não autenticado.' });
  const updated = db.toggleSavedPost(email, req.params.postId);
  res.json({ savedPosts: updated });
});

// ── Emergency Vet Contact Endpoints ──────────────────────────────────────────
api.get('/users/me/emergency-vet', (req, res) => {
  const email = getAuthUserEmail(req);
  if (!email) return res.status(401).json({ error: 'Não autenticado.' });
  res.json({ contact: db.getEmergencyVet(email) });
});

api.put('/users/me/emergency-vet', (req, res) => {
  const email = getAuthUserEmail(req);
  if (!email) return res.status(401).json({ error: 'Não autenticado.' });
  const contact = db.updateEmergencyVet(email, req.body);
  res.json({ contact });
});

// ── Data Safety, Backup & Restore Endpoints ─────────────────────────────────
api.get('/admin/backup/download', (_req, res) => {
  try {
    const data = exportDb();
    const dateStr = new Date().toISOString().split('T')[0];
    const filename = `uniao_pet_backup_${dateStr}.json`;
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.send(JSON.stringify(data, null, 2));
  } catch (err) {
    res.status(500).json({ error: 'Erro ao gerar arquivo de backup.', details: err.message });
  }
});

api.post('/admin/backup/restore', (req, res) => {
  try {
    const payload = req.body;
    if (!payload || typeof payload !== 'object') {
      return res.status(400).json({ error: 'Corpo da requisição deve ser um objeto JSON válido.' });
    }
    const result = restoreDb(payload);
    if (!result.success) {
      return res.status(400).json({ error: result.message });
    }
    res.json({ message: result.message, stats: getDbStats() });
  } catch (err) {
    res.status(500).json({ error: 'Falha ao restaurar banco de dados.', details: err.message });
  }
});

api.get('/admin/backup/stats', (_req, res) => {
  res.json(getDbStats());
});

api.get('/admin/backups', (_req, res) => {
  res.json({ backups: listBackups() });
});

export default api;

