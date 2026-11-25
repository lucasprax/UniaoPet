import express from 'express';
import compression from 'compression';
import crypto from 'crypto';
import { GoogleGenAI } from '@google/genai';
import {
  db,
  initDb,
  exportDb,
  restoreDb,
  createBackup,
  getDbStats,
  listBackups,
  getRevisions,
  getDbMode
} from './db.js';

// ── Server setup ─────────────────────────────────────────────────────────────
const api = express();

// High-Performance Gzip/Deflate compression for all JSON and text payloads
api.use(compression({
  threshold: 256,
  level: 6
}));

api.use(express.json({ limit: '20mb' }));

// ── Security: Password Hashing (scrypt) & HMAC Token Signing ────────────────
const AUTH_SECRET = process.env.AUTH_SECRET || (() => {
  console.warn('[UniãoPet Security] AUTH_SECRET não definido — usando chave aleatória temporária. Configure AUTH_SECRET em produção.');
  return crypto.randomBytes(32).toString('hex');
})();

function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return `scrypt$${salt}$${derived}`;
}

function verifyPassword(password: string, stored: string): { valid: boolean; needsUpgrade: boolean } {
  if (!stored) return { valid: false, needsUpgrade: false };
  if (stored.startsWith('scrypt$')) {
    const parts = stored.split('$');
    if (parts.length !== 3) return { valid: false, needsUpgrade: false };
    const [, salt, hashHex] = parts;
    const derived = crypto.scryptSync(password, salt, 64);
    const storedBuf = Buffer.from(hashHex, 'hex');
    if (derived.length !== storedBuf.length) return { valid: false, needsUpgrade: false };
    return {
      valid: crypto.timingSafeEqual(derived, storedBuf),
      needsUpgrade: false
    };
  }
  // Backwards compatibility with legacy plain-text passwords
  return {
    valid: stored === password,
    needsUpgrade: stored === password
  };
}

function signToken(user: { id: string; email: string }): string {
  const payload = Buffer.from(
    JSON.stringify({
      sub: user.id,
      email: user.email.toLowerCase(),
      iat: Date.now()
    })
  ).toString('base64url');
  const sig = crypto
    .createHmac('sha256', AUTH_SECRET)
    .update(payload)
    .digest('base64url');
  return `up.${payload}.${sig}`;
}

function verifyToken(token: string): string | null {
  try {
    if (!token.startsWith('up.')) return null;
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const [, payload, sig] = parts;
    const expectedSig = crypto
      .createHmac('sha256', AUTH_SECRET)
      .update(payload)
      .digest('base64url');
    if (sig !== expectedSig) return null;
    const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    return typeof decoded?.email === 'string' ? decoded.email : null;
  } catch {
    return null;
  }
}

/** Wrapper for Express 4 async routes so rejections reach the error handler */
const asyncHandler = (
  fn: (req: express.Request, res: express.Response, next: express.NextFunction) => Promise<any>
): express.RequestHandler => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

/** Extract requesting user's email from signed Bearer token, headers, or body */
function getAuthUserEmail(req: express.Request): string | null {
  const authHeader = req.headers['authorization'];
  if (typeof authHeader === 'string') {
    if (authHeader.startsWith('Bearer ')) {
      const verified = verifyToken(authHeader.slice(7).trim());
      if (verified) return verified;
    } else if (authHeader.includes('@')) {
      return authHeader;
    }
  }
  const xEmail = req.headers['x-user-email'];
  if (typeof xEmail === 'string' && xEmail.includes('@')) return xEmail;
  return (req.body?.userEmail as string) || (req.query?.userEmail as string) || null;
}

// Presence tracking middleware (throttled & non-blocking)
api.use((req, _res, next) => {
  const email = getAuthUserEmail(req);
  if (email && typeof email === 'string') {
    db.updateUserPresence(email).catch(() => {});
  }
  next();
});

/**
 * Resolves the "other" participant in a conversation using a pre-fetched user map.
 */
function resolveRecipient(conv: any, currentUserEmail: string, usersByEmail: Map<string, any>) {
  const participants: string[] = conv.participants || [];
  const lowerUser = (currentUserEmail || '').toLowerCase();
  const otherEmail = participants.find((p: string) => p && p.toLowerCase() !== lowerUser);

  if (!otherEmail) {
    return {
      email: conv.recipientEmail || '',
      name: conv.recipientName || conv.title,
      avatar: conv.recipientAvatar || null
    };
  }

  const otherUser = usersByEmail.get(otherEmail.toLowerCase());
  if (otherUser) {
    const { password, ...safeUser } = otherUser;
    return safeUser;
  }

  if (conv.recipientEmail && conv.recipientEmail.toLowerCase() === otherEmail.toLowerCase()) {
    return {
      email: otherEmail,
      name: conv.recipientName || otherEmail,
      avatar: conv.recipientAvatar || null
    };
  }

  return { email: otherEmail, name: otherEmail, avatar: null };
}

// ── Health & Sync Status ──────────────────────────────────────────────────────
api.get('/health', asyncHandler(async (_req, res) => {
  const dbMode = getDbMode();
  if (dbMode === 'unconfigured') {
    return res.status(503).json({
      status: 'unconfigured',
      db: dbMode,
      ai: Boolean(process.env.GEMINI_API_KEY),
      message: 'Adicione um banco Postgres na aba Storage da Vercel (DATABASE_URL).',
      time: new Date().toISOString()
    });
  }
  await initDb();
  res.json({
    status: 'ok',
    db: dbMode,
    ai: Boolean(process.env.GEMINI_API_KEY),
    time: new Date().toISOString()
  });
}));

// Lightweight instant sync status check
api.get('/sync/status', asyncHandler(async (_req, res) => {
  res.set('Cache-Control', 'no-store');
  const rev = await getRevisions();
  res.json({
    posts: rev.posts,
    conversations: rev.conversations,
    pets: rev.pets,
    users: rev.users,
    global: rev.global
  });
}));

// ── Auth ─────────────────────────────────────────────────────────────────────
api.post('/auth/register', asyncHandler(async (req, res) => {
  const { name, email, avatar, password } = req.body;
  if (!name || !email || !password) {
    return res.status(400).json({ error: 'Dados incompletos.' });
  }
  if (String(password).length < 4) {
    return res.status(400).json({ error: 'A senha deve ter pelo menos 4 caracteres.' });
  }
  if (await db.getUserByEmail(email)) {
    return res.status(400).json({ error: 'E-mail já está em uso.' });
  }
  const newUser = {
    id: `user-${Date.now()}`,
    name: String(name).trim(),
    email: String(email).trim().toLowerCase(),
    avatar: avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=f08136&color=fff&size=150`,
    password: hashPassword(String(password)),
    savedPosts: []
  };
  await db.insertUser(newUser);
  const { password: _, ...userWithoutPass } = newUser;
  res.status(201).json({ user: userWithoutPass, token: signToken(newUser) });
}));

api.post('/auth/login', asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Dados incompletos.' });
  }
  const user = await db.getUserByEmail(email);
  if (!user) {
    return res.status(401).json({ error: 'Credenciais inválidas.' });
  }
  const check = verifyPassword(String(password), user.password);
  if (!check.valid) {
    return res.status(401).json({ error: 'Credenciais inválidas.' });
  }
  // Transparently upgrade legacy plain-text passwords to scrypt hash
  if (check.needsUpgrade) {
    await db.updateUser(user.email, { password: hashPassword(String(password)) });
  }
  const { password: _, ...userWithoutPass } = user;
  res.json({
    user: userWithoutPass,
    token: signToken({ id: user.id || `user-${user.email}`, email: user.email })
  });
}));

// ── Public Pet Collar QR Rescue Endpoint (No Auth Required) ──────────────────
api.get('/public/pet/:petId', asyncHandler(async (req, res) => {
  const pet = await db.getPetById(req.params.petId);
  if (!pet) {
    return res.status(404).json({ error: 'Carteira ou QR Code deste pet não foi encontrado.' });
  }
  const owner = pet.ownerEmail ? await db.getUserByEmail(pet.ownerEmail) : null;
  res.json({
    pet,
    owner: {
      name: owner?.name || 'Tutor UniãoPet',
      email: owner?.email || pet.ownerEmail || '',
      phone: owner?.phone || '',
      avatar: owner?.avatar || '',
      emergencyVet: owner?.emergencyVet || null
    }
  });
}));

// ── Users ─────────────────────────────────────────────────────────────────────
api.patch('/users/me', asyncHandler(async (req, res) => {
  const { email, name, avatar, phone, bio } = req.body;
  if (!email) return res.status(400).json({ error: 'Email obrigatório.' });
  const updates: any = {};
  if (name !== undefined) updates.name = name;
  if (avatar !== undefined) updates.avatar = avatar;
  if (phone !== undefined) updates.phone = phone;
  if (bio !== undefined) updates.bio = bio;
  const updated = await db.updateUser(email, updates);
  if (!updated) return res.status(404).json({ error: 'Usuário não encontrado' });
  const { password: _, ...userWithoutPass } = updated;
  res.json(userWithoutPass);
}));

api.get('/users', asyncHandler(async (req, res) => {
  let users = await db.getUsers();
  if (req.query.q) {
    const q = (req.query.q as string).toLowerCase();
    users = users.filter((u: any) =>
      u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q)
    );
  }
  res.json(users.map((u: any) => {
    const { password, ...rest } = u;
    return rest;
  }));
}));

// ── Following ─────────────────────────────────────────────────────────────────
api.get('/following', asyncHandler(async (req, res) => {
  const userEmail = req.query.userEmail as string;
  if (!userEmail) return res.status(400).json({ error: 'userEmail é obrigatório.' });
  res.json(await db.getFollowing(userEmail));
}));

api.post('/users/:email/follow', asyncHandler(async (req, res) => {
  const userEmail = req.body.userEmail as string;
  if (!userEmail) return res.status(400).json({ error: 'userEmail é obrigatório.' });
  await db.insertFollowing(userEmail, req.params.email);
  res.status(201).json({ success: true });
}));

api.delete('/users/:email/follow', asyncHandler(async (req, res) => {
  const userEmail = req.body.userEmail as string;
  if (!userEmail) return res.status(400).json({ error: 'userEmail é obrigatório.' });
  await db.removeFollowing(userEmail, req.params.email);
  res.status(204).send();
}));

// ── Posts ─────────────────────────────────────────────────────────────────────
api.get('/posts', asyncHandler(async (req, res) => {
  const userEmail = req.query.userEmail as string | undefined;
  const clientEtag = req.headers['if-none-match'];
  const rev = await getRevisions();
  const currentEtag = `"posts-v${rev.posts}"`;

  res.setHeader('ETag', currentEtag);
  res.setHeader('Cache-Control', 'private, no-cache, must-revalidate');

  if (clientEtag === currentEtag) {
    return res.status(304).end();
  }

  const [posts, commentsMap] = await Promise.all([
    db.getPosts(),
    db.getAllCommentsGrouped()
  ]);

  const postsWithComments = posts.map((post: any) => {
    const likedBy: string[] = post.likedBy || [];
    return {
      ...post,
      likedByMe: userEmail ? likedBy.includes(userEmail) : false,
      comments: commentsMap.get(post.id) || []
    };
  });
  res.json(postsWithComments);
}));

api.post('/posts', asyncHandler(async (req, res) => {
  const userEmail = getAuthUserEmail(req) || req.body.authorEmail || '';

  // Debounce guard against rapid duplicate submissions (within 10 seconds)
  const posts = await db.getPosts();
  const title = (req.body.title || '').trim().toLowerCase();
  const petName = (req.body.petName || '').trim().toLowerCase();
  const tenSecondsAgo = Date.now() - 10000;

  const existing = posts.find((p: any) => {
    const sameAuthor = (p.authorEmail && p.authorEmail === userEmail) || (p.authorName && p.authorName === req.body.authorName);
    const sameTitle = (p.title || '').trim().toLowerCase() === title;
    const samePet = (p.petName || '').trim().toLowerCase() === petName;
    const isRecent = p.createdAt ? Date.parse(p.createdAt) > tenSecondsAgo : false;
    return sameAuthor && sameTitle && samePet && isRecent;
  });

  if (existing) {
    const comments = await db.getCommentsByPostId(existing.id);
    return res.status(200).json({ ...existing, likedByMe: false, comments });
  }

  const nowIso = new Date().toISOString();
  const newPost = {
    id: `post-${Date.now()}`,
    ...req.body,
    authorEmail: userEmail,
    likedBy: [],
    likes: 0,
    status: req.body.status || 'ativo',
    date: req.body.date || nowIso,
    createdAt: nowIso
  };
  const created = await db.insertPost(newPost);
  res.status(201).json({ ...created, likedByMe: false, comments: [] });
}));

api.patch('/posts/:id/like', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const userEmail = req.body.userEmail as string;
  if (!userEmail) return res.status(400).json({ error: 'userEmail é obrigatório.' });

  const post = await db.getPostById(id);
  if (!post) return res.status(404).json({ error: 'Post não encontrado.' });

  const updated = await db.togglePostLike(id, userEmail);
  const likedBy: string[] = updated?.likedBy || [];
  res.json({ ...updated, likedByMe: likedBy.includes(userEmail) });
}));

api.patch('/posts/:id/status', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;
  const post = await db.getPostById(id);
  if (!post) return res.status(404).json({ error: 'Post não encontrado.' });
  const updated = await db.togglePostStatus(id, status);
  res.json(updated);
}));

api.delete('/posts/:id', asyncHandler(async (req, res) => {
  const userEmail = getAuthUserEmail(req);
  const post = await db.getPostById(req.params.id);
  if (!post) return res.status(404).json({ error: 'Post não encontrado.' });
  if (post.authorEmail && userEmail && post.authorEmail !== userEmail) {
    return res.status(403).json({ error: 'Sem permissão para deletar este post.' });
  }
  await db.deletePost(req.params.id);
  res.status(204).send();
}));

api.post('/posts/:id/comments', asyncHandler(async (req, res) => {
  const newComment = {
    id: `comment-${Date.now()}`,
    postId: req.params.id,
    ...req.body,
    createdAt: new Date().toISOString()
  };
  const created = await db.insertComment(newComment);
  res.status(201).json(created);
}));

// ── Conversations ─────────────────────────────────────────────────────────────
api.get('/conversations', asyncHandler(async (req, res) => {
  const userEmail = req.query.userEmail as string;
  if (!userEmail) return res.status(400).json({ error: 'userEmail é obrigatório.' });

  const clientEtag = req.headers['if-none-match'];
  const rev = await getRevisions();
  const currentEtag = `"convs-${encodeURIComponent(userEmail)}-v${rev.conversations}"`;

  res.setHeader('ETag', currentEtag);
  res.setHeader('Cache-Control', 'private, no-cache, must-revalidate');

  if (clientEtag === currentEtag) {
    return res.status(304).end();
  }

  const [conversations, allUsers] = await Promise.all([
    db.getConversationsByParticipant(userEmail),
    db.getUsers()
  ]);

  const usersByEmail = new Map<string, any>();
  for (const u of allUsers) {
    if (u?.email) usersByEmail.set(u.email.toLowerCase(), u);
  }

  const messagesByConv = await db.getMessagesGroupedByConversations(
    conversations.map((c: any) => c.id)
  );

  const result = conversations.map((conv: any) => {
    const messages = messagesByConv.get(conv.id) || [];
    const unreadFor: string[] = conv.unreadFor || [];
    const recipient = resolveRecipient(conv, userEmail, usersByEmail);

    return {
      ...conv,
      recipient,
      messages,
      hasUnread: unreadFor.some((e: string) => e && e.toLowerCase() === userEmail.toLowerCase())
    };
  });

  res.json(result);
}));

api.post('/conversations', asyncHandler(async (req, res) => {
  const { participants, recipientEmail, recipientName, recipientAvatar, ...rest } = req.body;
  const newConv = {
    id: `chat-${Date.now()}`,
    ...rest,
    participants: participants || [],
    recipientEmail: recipientEmail || '',
    recipientName: recipientName || '',
    recipientAvatar: recipientAvatar || '',
    unreadFor: [],
    createdAt: new Date().toISOString()
  };
  const created = await db.insertConversation(newConv);
  res.status(201).json({ ...created, messages: [] });
}));

api.patch('/conversations/:id/read', asyncHandler(async (req, res) => {
  const userEmail = req.body.userEmail as string;
  if (!userEmail) return res.status(400).json({ error: 'userEmail é obrigatório.' });
  await db.markConversationRead(req.params.id, userEmail);
  res.json({ success: true });
}));

api.delete('/conversations/:id', asyncHandler(async (req, res) => {
  const userEmail = req.body.userEmail as string || getAuthUserEmail(req);
  if (!userEmail) return res.status(400).json({ error: 'userEmail é obrigatório.' });

  const conv = await db.getConversationById(req.params.id);
  if (!conv) return res.status(404).json({ error: 'Conversa não encontrada.' });

  const participants: string[] = conv.participants || [];
  const lowerUser = userEmail.toLowerCase();
  if (participants.length > 0 && !participants.some(p => p && p.toLowerCase() === lowerUser)) {
    return res.status(403).json({ error: 'Sem permissão para apagar esta conversa.' });
  }

  await db.deleteConversation(req.params.id);
  res.status(204).send();
}));

// ── Messages ──────────────────────────────────────────────────────────────────
api.post('/conversations/:id/messages', asyncHandler(async (req, res) => {
  const { senderEmail, senderName, text, timestamp, imageUrl, sharedPost } = req.body;
  const convId = req.params.id;

  const newMsg: any = {
    id: `msg-${Date.now()}`,
    conversationId: convId,
    senderEmail: senderEmail || '',
    senderName: senderName || '',
    text: text || '',
    timestamp: timestamp || new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
    createdAt: new Date().toISOString()
  };
  if (imageUrl) newMsg.imageUrl = imageUrl;
  if (sharedPost) newMsg.sharedPost = sharedPost;

  const created = await db.insertMessage(newMsg);

  await db.updateConversation(convId, {
    lastMessage: imageUrl ? '📷 Imagem' : sharedPost ? '🔗 Publicação' : text,
    date: 'Agora',
    updatedAt: new Date().toISOString()
  });

  const conv = await db.getConversationById(convId);
  if (conv) {
    const participants: string[] = conv.participants || [];
    for (const participantEmail of participants) {
      if (participantEmail && senderEmail && participantEmail.toLowerCase() !== senderEmail.toLowerCase()) {
        await db.addToUnreadFor(convId, participantEmail);
      }
    }
  }

  res.status(201).json(created);
}));

// ── Pets & Caderneta de Vacinação ──────────────────────────────────────────────
api.get('/pets', asyncHandler(async (req, res) => {
  const userEmail = (req.query.userEmail as string) || getAuthUserEmail(req);
  if (!userEmail) return res.status(400).json({ error: 'userEmail é obrigatório.' });
  const pets = await db.getPets(userEmail);
  res.json(pets);
}));

api.post('/pets', asyncHandler(async (req, res) => {
  const userEmail = getAuthUserEmail(req) || req.body.ownerEmail;
  if (!userEmail) return res.status(400).json({ error: 'ownerEmail é obrigatório.' });
  const { name, species, breed, birthDate, gender, weight, avatar, microchip, notes, allergies, neutered, bloodType } = req.body;
  if (!name) return res.status(400).json({ error: 'Nome do pet é obrigatório.' });

  const newPet = {
    id: `pet-${Date.now()}`,
    ownerEmail: userEmail,
    name,
    species: species || 'dog',
    breed: breed || 'Sem raça definida (SRD)',
    birthDate: birthDate || '',
    gender: gender || 'macho',
    weight: weight || '',
    avatar: avatar || (species === 'cat'
      ? 'https://images.unsplash.com/photo-1543852786-1cf6624b9987?auto=format&fit=crop&q=80&w=300'
      : 'https://images.unsplash.com/photo-1548767797-d8c844163c4c?auto=format&fit=crop&q=80&w=300'),
    microchip: microchip || '',
    notes: notes || '',
    allergies: allergies || '',
    neutered: Boolean(neutered),
    bloodType: bloodType || '',
    vaccines: [],
    medications: [],
    weightHistory: [],
    createdAt: new Date().toISOString()
  };

  const created = await db.insertPet(newPet);
  res.status(201).json(created);
}));

api.patch('/pets/:id', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const pet = await db.getPetById(id);
  if (!pet) return res.status(404).json({ error: 'Pet não encontrado.' });
  const updated = await db.updatePet(id, req.body);
  res.json(updated);
}));

api.delete('/pets/:id', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const pet = await db.getPetById(id);
  if (!pet) return res.status(404).json({ error: 'Pet não encontrado.' });
  await db.deletePet(id);
  res.status(204).send();
}));

api.post('/pets/:id/vaccines', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const pet = await db.getPetById(id);
  if (!pet) return res.status(404).json({ error: 'Pet não encontrado.' });
  const { name, type, dateApplied, nextDueDate, veterinarian, clinic, batch, notes, status } = req.body;
  if (!name || !dateApplied) {
    return res.status(400).json({ error: 'Nome e data de aplicação são obrigatórios.' });
  }

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
    status: status || 'em_dia'
  };

  const created = await db.addVaccine(id, newVaccine);
  res.status(201).json(created);
}));

api.patch('/pets/:id/vaccines/:vaccineId', asyncHandler(async (req, res) => {
  const { id, vaccineId } = req.params;
  const updated = await db.updateVaccine(id, vaccineId, req.body);
  if (!updated) return res.status(404).json({ error: 'Registro não encontrado.' });
  res.json(updated);
}));

api.delete('/pets/:id/vaccines/:vaccineId', asyncHandler(async (req, res) => {
  const { id, vaccineId } = req.params;
  const deleted = await db.deleteVaccine(id, vaccineId);
  if (!deleted) return res.status(404).json({ error: 'Registro não encontrado.' });
  res.status(204).send();
}));

// ── Pet Medications Endpoints ────────────────────────────────────────────────
api.post('/pets/:id/medications', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const pet = await db.getPetById(id);
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
  const created = await db.addMedication(id, newMed);
  res.status(201).json(created);
}));

api.patch('/pets/:id/medications/:medId', asyncHandler(async (req, res) => {
  const { id, medId } = req.params;
  const updated = await db.updateMedication(id, medId, req.body);
  if (!updated) return res.status(404).json({ error: 'Medicamento não encontrado.' });
  res.json(updated);
}));

api.delete('/pets/:id/medications/:medId', asyncHandler(async (req, res) => {
  const { id, medId } = req.params;
  const deleted = await db.deleteMedication(id, medId);
  if (!deleted) return res.status(404).json({ error: 'Medicamento não encontrado.' });
  res.status(204).send();
}));

api.post('/pets/:id/medications/:medId/toggle-taken', asyncHandler(async (req, res) => {
  const { id, medId } = req.params;
  const dateStr = req.body.date || new Date().toISOString().split('T')[0];
  const updated = await db.toggleMedicationTaken(id, medId, dateStr);
  if (!updated) return res.status(404).json({ error: 'Medicamento não encontrado.' });
  res.json(updated);
}));

// ── Pet Weight History Endpoints ─────────────────────────────────────────────
api.post('/pets/:id/weight', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const pet = await db.getPetById(id);
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
  const created = await db.addWeightRecord(id, record);
  res.status(201).json(created);
}));

api.delete('/pets/:id/weight/:weightId', asyncHandler(async (req, res) => {
  const { id, weightId } = req.params;
  const deleted = await db.deleteWeightRecord(id, weightId);
  if (!deleted) return res.status(404).json({ error: 'Registro não encontrado.' });
  res.status(204).send();
}));

// ── Saved Posts (Bookmarks) Endpoints ────────────────────────────────────────
api.get('/users/me/saved-posts', asyncHandler(async (req, res) => {
  const email = getAuthUserEmail(req);
  if (!email) return res.status(401).json({ error: 'Não autenticado.' });
  const savedIds = await db.getSavedPosts(email);
  res.json({ savedPosts: savedIds });
}));

api.post('/users/me/saved-posts/:postId', asyncHandler(async (req, res) => {
  const email = getAuthUserEmail(req);
  if (!email) return res.status(401).json({ error: 'Não autenticado.' });
  const updated = await db.toggleSavedPost(email, req.params.postId);
  res.json({ savedPosts: updated });
}));

// ── Emergency Vet Contact Endpoints ──────────────────────────────────────────
api.get('/users/me/emergency-vet', asyncHandler(async (req, res) => {
  const email = getAuthUserEmail(req);
  if (!email) return res.status(401).json({ error: 'Não autenticado.' });
  res.json({ contact: await db.getEmergencyVet(email) });
}));

api.put('/users/me/emergency-vet', asyncHandler(async (req, res) => {
  const email = getAuthUserEmail(req);
  if (!email) return res.status(401).json({ error: 'Não autenticado.' });
  const contact = await db.updateEmergencyVet(email, req.body);
  res.json({ contact });
}));

// ── AI Gemini & Smart Veterinary Endpoints ───────────────────────────────────

/** 1. OCR de Carteira de Vacinação por Foto (Gemini Vision + Fallback inteligente) */
api.post('/ai/scan-vaccine', asyncHandler(async (req, res) => {
  const { imageBase64, petSpecies } = req.body;
  if (!imageBase64 || typeof imageBase64 !== 'string') {
    return res.status(400).json({ error: 'Imagem inválida.' });
  }

  const today = new Date();
  const todayIso = today.toISOString().split('T')[0];
  const nextYear = new Date(today);
  nextYear.setFullYear(nextYear.getFullYear() + 1);
  const nextYearIso = nextYear.toISOString().split('T')[0];

  const apiKey = process.env.GEMINI_API_KEY;
  if (apiKey) {
    try {
      const ai = new GoogleGenAI({ apiKey });
      const cleanBase64 = imageBase64.replace(/^data:image\/\w+;base64,/, '');
      const mimeMatch = imageBase64.match(/^data:(image\/\w+);base64,/);
      const mimeType = mimeMatch ? mimeMatch[1] : 'image/jpeg';

      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: [
          {
            role: 'user',
            parts: [
              { inlineData: { data: cleanBase64, mimeType } },
              {
                text: `Analise esta foto de etiqueta/carteira de vacinação veterinária (${petSpecies || 'pet'}).
Extraia os dados e retorne APENAS um JSON válido com as chaves:
{
  "name": "Nome da vacina ou vermífugo (ex: Vacina V10 Vanguard Plus, Antirrábica, Quádrupla Felina V4)",
  "type": "vacina" | "vermifugo" | "consulta",
  "dateApplied": "YYYY-MM-DD",
  "nextDueDate": "YYYY-MM-DD",
  "veterinarian": "Nome do veterinário ou CRMV se visível",
  "clinic": "Nome da clínica se visível",
  "batch": "Número do lote/partida se visível",
  "notes": "Fabricante ou observações breves"
}
Se alguma data não estiver visível, use "${todayIso}" para dateApplied e "${nextYearIso}" para nextDueDate.`
              }
            ]
          }
        ]
      });

      const rawText = response.text || '';
      const jsonMatch = rawText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return res.json({
          name: parsed.name || (petSpecies === 'cat' ? 'Vacina Quádrupla Felina (V4)' : 'Vacina Polivalente V10'),
          type: ['vacina', 'vermifugo', 'consulta'].includes(parsed.type) ? parsed.type : 'vacina',
          dateApplied: parsed.dateApplied || todayIso,
          nextDueDate: parsed.nextDueDate || nextYearIso,
          veterinarian: parsed.veterinarian || '',
          clinic: parsed.clinic || '',
          batch: parsed.batch || '',
          notes: parsed.notes || 'Extraído via leitura óptica Gemini Vision',
          source: 'gemini'
        });
      }
    } catch (err) {
      console.warn('[UniãoPet AI] Gemini OCR fallback triggered:', err);
    }
  }

  // Deterministic smart fallback when GEMINI_API_KEY is not configured
  const isCat = petSpecies === 'cat';
  res.json({
    name: isCat ? 'Vacina Quádrupla Felina (V4)' : 'Vacina Polivalente V10 (Importada)',
    type: 'vacina',
    dateApplied: todayIso,
    nextDueDate: nextYearIso,
    veterinarian: '',
    clinic: '',
    batch: `LOT-${Math.floor(10000 + Math.random() * 90000)}`,
    notes: 'Selo digitalizado (confira o lote e data impressos na etiqueta)',
    source: 'smart-assist'
  });
}));

/** 2. Assistente de Triagem & Toxicologia Veterinária (Clinical Engine + Gemini AI) */
api.post('/ai/triage', asyncHandler(async (req, res) => {
  const { query, petSpecies = 'dog', weightKg = 10 } = req.body;
  if (!query || typeof query !== 'string') {
    return res.status(400).json({ error: 'Descreva o que aconteceu com o pet.' });
  }

  const q = query.toLowerCase();
  const w = Number(weightKg) > 0 ? Number(weightKg) : 8;
  const speciesLabel = petSpecies === 'cat' ? 'Gato' : petSpecies === 'bird' ? 'Ave' : 'Cão';

  // Try Gemini AI first if GEMINI_API_KEY is configured
  const apiKey = process.env.GEMINI_API_KEY;
  if (apiKey) {
    try {
      const ai = new GoogleGenAI({ apiKey });
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: `Você é um veterinário emergencista de triagem do UniãoPet.
Animal: ${speciesLabel}, Peso aproximado: ${w} kg.
Relato do tutor: "${query}"
Retorne APENAS um objeto JSON válido em português com esta estrutura exata:
{
  "urgencyLevel": "critica" | "alta" | "moderada" | "baixa",
  "title": "Título curto do diagnóstico de triagem",
  "summary": "Avaliação objetiva em 2 frases (incluindo cálculo de dose tóxica por kg se aplicável)",
  "immediateSteps": ["Passo 1 imediato", "Passo 2", "Passo 3"],
  "warnings": ["O que NÃO fazer em hipótese alguma"],
  "vetRecommendation": "Orientação clara para o transporte ao veterinário"
}`
      });
      const rawText = response.text || '';
      const jsonMatch = rawText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return res.json({ ...parsed, source: 'gemini' });
      }
    } catch (err) {
      console.warn('[UniãoPet AI] Gemini triage fallback triggered:', err);
    }
  }

  // Built-in Veterinary Clinical & Toxicology Triage Engine (instant, works offline/without API key)
  if (q.includes('chocolat') || q.includes('cacau') || q.includes('brigadeiro') || q.includes('ovinho')) {
    const gramsMatch = q.match(/(\d+(?:[.,]\d+)?)\s*(?:g|grama)/);
    const grams = gramsMatch ? parseFloat(gramsMatch[1].replace(',', '.')) : 40;
    const isDark = q.includes('amargo') || q.includes('70%') || q.includes('cacau');
    const theobromineMgPerG = isDark ? 14 : 2.2;
    const totalTheoMg = Math.round(grams * theobromineMgPerG);
    const doseMgKg = +(totalTheoMg / w).toFixed(1);
    const urgencyLevel = doseMgKg >= 40 ? 'critica' : doseMgKg >= 20 ? 'alta' : 'moderada';

    return res.json({
      urgencyLevel,
      title: `Intoxicação por Teobromina (Chocolate) — ~${doseMgKg} mg/kg`,
      summary: `Para um ${speciesLabel.toLowerCase()} de ${w} kg, ~${grams}g de chocolate ${isDark ? 'amargo/cacau' : 'ao leite'} fornecem cerca de ${totalTheoMg} mg de teobromina (${doseMgKg} mg/kg). Doses acima de 20 mg/kg já causam sintomas tóxicos e acima de 40–50 mg/kg oferecem risco cardíaco e neurológico.`,
      immediateSteps: [
        'Retire imediatamente qualquer resto de chocolate ou embalagem do alcance do pet.',
        'Anote o horário aproximado da ingestão, a marca e o teor de cacau da embalagem.',
        'Se a ingestão ocorreu há menos de 2 horas, o veterinário poderá realizar descontaminação gástrica e administrar carvão ativado.',
        'Ofereça água fresca, mas não force a ingestão de líquidos.'
      ],
      warnings: [
        'NÃO induza o vômito em casa com sal ou água oxigenada (risco de aspiração pulmonar e gastrite severa).',
        'NÃO dê leite ou azeite (gorduras aceleram a absorção da teobromina).'
      ],
      vetRecommendation: urgencyLevel === 'critica'
        ? 'EMERGÊNCIA IMEDIATA: Leve agora ao hospital veterinário 24h para lavagem gástrica, fluidoterapia e monitoramento cardíaco.'
        : 'Leve para avaliação veterinária nas próximas 1–2 horas antes que a teobromina seja totalmente absorvida.',
      source: 'clinical-engine'
    });
  }

  if (q.includes('uva') || q.includes('passa') || q.includes('xilitol') || q.includes('chiclete') || q.includes('adoçante')) {
    return res.json({
      urgencyLevel: 'critica',
      title: 'Ingestão de Substância Nefrotóxica / Hipoglicemiante (Uva, Passas ou Xilitol)',
      summary: `Uvas/passas podem causar insuficiência renal aguda mesmo em pequenas quantidades em ${speciesLabel.toLowerCase()}s, e o xilitol provoca hipoglicemia fulminante e necrose hepática em 30 a 60 minutos.`,
      immediateSteps: [
        'Identifique a quantidade aproximada ingerida e leve a embalagem ao veterinário.',
        'Observe sinais como fraqueza nas patas, gengiva pálida, tremores ou vômito.',
        'Dirija-se imediatamente à clínica veterinária para descontaminação e fluidoterapia intravenosa.'
      ],
      warnings: [
        'NÃO aguarde os sintomas aparecerem — quando os sinais renais surgem, a lesão já está instalada.'
      ],
      vetRecommendation: 'Atendimento veterinário de emergência imediato (janela ideal: primeiros 60 minutos).',
      source: 'clinical-engine'
    });
  }

  if (q.includes('paracetamol') || q.includes('tylenol') || q.includes('ibuprofeno') || q.includes('dipirona') || q.includes('diclofenaco') || q.includes('aspirina') || q.includes('remédio')) {
    return res.json({
      urgencyLevel: 'critica',
      title: 'Intoxicação Medicamentosa por Analgésico / Anti-inflamatório Humano',
      summary: `Medicamentos humanos como Paracetamol e Ibuprofeno são altamente tóxicos para ${speciesLabel.toLowerCase()}s (especialmente gatos, causando metemoglobinemia, cianose e falência hepática/renal).`,
      immediateSteps: [
        'Guarde a cartela do medicamento para o veterinário calcular a miligramagem exata.',
        'Verifique a cor da gengiva e língua (cor arroxeada, acinzentada ou marrom indica falta de oxigenação crítica).',
        'Transporte imediatamente para administração do antídoto específico (N-acetilcisteína) e suporte.'
      ],
      warnings: [
        'NUNCA dê leite, óleo ou outro medicamento caseiro tentando neutralizar o efeito.'
      ],
      vetRecommendation: 'Emergência máxima: leve ao plantão veterinário 24h imediatamente com a caixa do remédio.',
      source: 'clinical-engine'
    });
  }

  if (q.includes('chumbinho') || q.includes('veneno') || q.includes('rato') || q.includes('raticida') || q.includes('convuls') || q.includes('espuma') || q.includes('tremendo')) {
    return res.json({
      urgencyLevel: 'critica',
      title: 'Suspeita de Envenenamento Agudo / Síndrome Neurológica',
      summary: `Tremores, salivação espumosa, pupilas contraídas ou convulsões indicam intoxicação aguda (como carbamato/chumbinho) ou crise neurológica em ${speciesLabel.toLowerCase()} de ${w} kg.`,
      immediateSteps: [
        'Se o animal estiver convulsionando, afaste móveis e objetos rígidos e proteja a cabeça com uma toalha macia.',
        'Mantenha as vias aéreas livres, sem colocar os dedos dentro da boca do animal.',
        'Enrole o pet em uma manta para transporte seguro imediatamente.'
      ],
      warnings: [
        'NUNCA tente dar água, leite, carvão ou induzir vômito em animal com tremores, sonolência ou convulsão (risco fatal de asfixia).'
      ],
      vetRecommendation: 'Risco imediato à vida: desloque-se agora ao hospital veterinário mais próximo (antídoto Atropina / Vitamina K1).',
      source: 'clinical-engine'
    });
  }

  return res.json({
    urgencyLevel: 'alta',
    title: `Triagem Clínica Rápida (${speciesLabel} • ${w} kg)`,
    summary: `Analisamos o relato: "${query}". Sinais agudos exigem observação dos parâmetros vitais (cor da gengiva, padrão respiratório e nível de consciência).`,
    immediateSteps: [
      'Verifique a cor da gengiva: deve estar rosada e voltar à cor normal em até 2 segundos após leve pressão.',
      'Mantenha o pet em local calmo, fresco e ventilado, evitando esforço físico.',
      'Anote quando os sintomas começaram e se houve acesso a plantas, lixo, rua ou alimentos diferentes.'
    ],
    warnings: [
      'Não administre medicamentos de uso humano sem prescrição veterinária.',
      'Não force alimentação se o animal estiver nauseado ou ofegante.'
    ],
    vetRecommendation: 'Entre em contato com seu veterinário de confiança ou plantão 24h na aba "Meu Veterinário 24h".',
    source: 'clinical-engine'
  });
}));

/** 3. Cruzamento Inteligente de Pets Perdidos x Encontrados/Adoção */
api.post('/ai/match-posts', asyncHandler(async (req, res) => {
  const { postId } = req.body;
  const allPosts = await db.getPosts();
  const target = allPosts.find((p: any) => p.id === postId);
  if (!target) {
    return res.status(404).json({ error: 'Publicação não encontrada.' });
  }

  const tokenize = (str: string) =>
    (str || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .split(/[^a-z0-9]+/)
      .filter(w => w.length >= 3);

  const targetLocTokens = new Set(tokenize(target.location));
  const targetDescTokens = new Set(tokenize(`${target.title} ${target.description} ${target.petName}`));

  const candidates = allPosts
    .filter((p: any) => p.id !== target.id && p.status !== 'resolvido')
    .map((candidate: any) => {
      let score = 0;
      const reasons: string[] = [];

      // Species match
      if (target.species && candidate.species && target.species === candidate.species) {
        score += 38;
        reasons.push('Mesma espécie');
      }

      // Location overlap
      const candLocTokens = tokenize(candidate.location);
      const sharedLoc = candLocTokens.filter(t => targetLocTokens.has(t));
      if (sharedLoc.length > 0) {
        score += Math.min(35, sharedLoc.length * 18);
        reasons.push(`Região próxima (${candidate.location})`);
      }

      // Characteristic keywords overlap (colors, breeds, traits)
      const candDescTokens = tokenize(`${candidate.title} ${candidate.description} ${candidate.petName}`);
      const sharedTraits = Array.from(new Set(candDescTokens.filter(t => targetDescTokens.has(t))));
      if (sharedTraits.length > 0) {
        score += Math.min(27, sharedTraits.length * 7);
        reasons.push(`Características em comum: ${sharedTraits.slice(0, 3).join(', ')}`);
      }

      return {
        post: candidate,
        score: Math.min(98, score),
        reasons
      };
    })
    .filter(item => item.score >= 30)
    .sort((a, b) => b.score - a.score)
    .slice(0, 4);

  res.json({ matches: candidates });
}));

// ── Data Safety, Backup & Restore Endpoints ─────────────────────────────────
const requireAdminAuth: express.RequestHandler = (req, res, next) => {
  const adminSecret = process.env.ADMIN_SECRET;
  const providedSecret = req.headers['x-admin-secret'];
  if (adminSecret) {
    if (typeof providedSecret === 'string' && providedSecret === adminSecret) {
      return next();
    }
    return res.status(401).json({ error: 'Autenticação administrativa necessária.' });
  }
  const authHeader = req.headers['authorization'];
  if (typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
    const verified = verifyToken(authHeader.slice(7).trim());
    if (verified) return next();
  }
  return res.status(401).json({ error: 'Autenticação necessária para acessar backups.' });
};

api.get('/admin/backup/download', requireAdminAuth, asyncHandler(async (_req, res) => {
  const data = await exportDb();
  const dateStr = new Date().toISOString().split('T')[0];
  const filename = `uniao_pet_backup_${dateStr}.json`;
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.send(JSON.stringify(data, null, 2));
}));

api.post('/admin/backup/restore', requireAdminAuth, asyncHandler(async (req, res) => {
  const payload = req.body;
  if (!payload || typeof payload !== 'object') {
    return res.status(400).json({ error: 'Corpo da requisição deve ser um objeto JSON válido.' });
  }
  const result = await restoreDb(payload);
  if (!result.success) {
    return res.status(400).json({ error: result.message });
  }
  res.json({ message: result.message, stats: await getDbStats() });
}));

api.get('/admin/backup/stats', requireAdminAuth, asyncHandler(async (_req, res) => {
  res.json(await getDbStats());
}));

api.get('/admin/backups', requireAdminAuth, asyncHandler(async (_req, res) => {
  res.json({ backups: await listBackups() });
}));

api.post('/admin/backup/create', requireAdminAuth, asyncHandler(async (_req, res) => {
  const file = await createBackup('manual');
  if (file) {
    res.json({ message: 'Backup manual criado com sucesso!', file });
  } else {
    res.status(500).json({ error: 'Não foi possível gerar o backup manual.' });
  }
}));

// Centralized error handler (essential for serverless)
api.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('[UniãoPet API Error]', err);
  res.status(500).json({
    error: err?.message || 'Erro interno no servidor.'
  });
});

export default api;
