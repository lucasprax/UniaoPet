import fs from 'fs';
import path from 'path';

// ── Directory and File Path Resolution ───────────────────────────────────────
const DATA_DIR = process.env.DATA_DIR || path.resolve(process.cwd(), 'data');
const BACKUPS_DIR = path.join(DATA_DIR, 'backups');

function resolveDbPath() {
  if (process.env.DB_PATH) {
    return path.resolve(process.cwd(), process.env.DB_PATH);
  }

  const inDataDir = path.join(DATA_DIR, 'uniao_pet_db.json');
  const inRootDir = path.resolve(process.cwd(), 'uniao_pet_db.json');

  if (fs.existsSync(inDataDir)) {
    return inDataDir;
  }

  if (fs.existsSync(inRootDir)) {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
      fs.copyFileSync(inRootDir, inDataDir);
      console.log(`[UniãoPet DB] Migrated database safely from root to ${inDataDir}`);
      return inDataDir;
    } catch (e) {
      console.warn('[UniãoPet DB] Failed to migrate to data/, using root path:', e);
      return inRootDir;
    }
  }

  if (!fs.existsSync(DATA_DIR)) {
    try {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    } catch {}
  }
  return inDataDir;
}

const dbPath = resolveDbPath();

const initialData = {
  users: [],
  posts: [],
  comments: [],
  conversations: [],
  messages: [],
  following: [],
  pets: []
};

// High-Performance In-Memory Cache (RAM)
let cachedData = null;
let saveTimeout = null;
let isSaving = false;

// ── Backup System ────────────────────────────────────────────────────────────
export function createBackup(prefix = 'auto') {
  try {
    if (!fs.existsSync(BACKUPS_DIR)) {
      fs.mkdirSync(BACKUPS_DIR, { recursive: true });
    }
    if (!fs.existsSync(dbPath)) return null;

    const stat = fs.statSync(dbPath);
    if (stat.size === 0) return null;

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupFile = path.join(BACKUPS_DIR, `uniao_pet_db_${prefix}_${timestamp}.json`);
    fs.copyFileSync(dbPath, backupFile);
    console.log(`[UniãoPet Backup] Snapshot saved to: ${backupFile}`);

    pruneOldBackups(15);
    return backupFile;
  } catch (err) {
    console.error('[UniãoPet Backup] Error creating backup:', err);
    return null;
  }
}

function pruneOldBackups(maxKeep = 15) {
  try {
    if (!fs.existsSync(BACKUPS_DIR)) return;
    const files = fs.readdirSync(BACKUPS_DIR)
      .filter(f => f.startsWith('uniao_pet_db_') && f.endsWith('.json'))
      .map(f => ({
        path: path.join(BACKUPS_DIR, f),
        time: fs.statSync(path.join(BACKUPS_DIR, f)).mtimeMs
      }))
      .sort((a, b) => b.time - a.time);

    if (files.length > maxKeep) {
      files.slice(maxKeep).forEach(file => {
        try { fs.unlinkSync(file.path); } catch {}
      });
    }
  } catch (e) {
    console.error('[UniãoPet Backup] Error pruning old backups:', e);
  }
}

function tryRecoverFromBackup() {
  try {
    if (!fs.existsSync(BACKUPS_DIR)) return false;
    const files = fs.readdirSync(BACKUPS_DIR)
      .filter(f => f.startsWith('uniao_pet_db_') && f.endsWith('.json'))
      .map(f => ({
        path: path.join(BACKUPS_DIR, f),
        time: fs.statSync(path.join(BACKUPS_DIR, f)).mtimeMs
      }))
      .sort((a, b) => b.time - a.time);

    for (const b of files) {
      try {
        const raw = fs.readFileSync(b.path, 'utf8');
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object' && Array.isArray(parsed.users) && parsed.users.length > 0) {
          fs.copyFileSync(b.path, dbPath);
          console.warn(`[UniãoPet Auto-Recovery] RESTORED DATABASE FROM BACKUP: ${b.path}`);
          return true;
        }
      } catch {}
    }
  } catch (e) {
    console.error('[UniãoPet Auto-Recovery] Recovery attempt failed:', e);
  }
  return false;
}

// ── Non-Destructive Schema Normalizer (Zero Breaking Changes) ────────────────
function normalizeSchema(raw) {
  const data = raw && typeof raw === 'object' ? raw : {};
  const normalized = {
    users: Array.isArray(data.users) ? data.users : [],
    posts: Array.isArray(data.posts) ? data.posts : [],
    comments: Array.isArray(data.comments) ? data.comments : [],
    conversations: Array.isArray(data.conversations) ? data.conversations : [],
    messages: Array.isArray(data.messages) ? data.messages : [],
    following: Array.isArray(data.following) ? data.following : [],
    pets: Array.isArray(data.pets) ? data.pets : []
  };

  normalized.users = normalized.users.map(u => ({
    ...u,
    savedPosts: Array.isArray(u.savedPosts) ? u.savedPosts : []
  }));

  normalized.posts = normalized.posts.map(p => ({
    ...p,
    likes: typeof p.likes === 'number' ? p.likes : 0,
    likedBy: Array.isArray(p.likedBy) ? p.likedBy : [],
    status: p.status || 'ativo'
  }));

  normalized.pets = normalized.pets.map(pet => ({
    ...pet,
    vaccines: Array.isArray(pet.vaccines) ? pet.vaccines : [],
    medications: Array.isArray(pet.medications) ? pet.medications : [],
    weightHistory: Array.isArray(pet.weightHistory) ? pet.weightHistory : []
  }));

  return normalized;
}

// ── Initialization & Persistence ─────────────────────────────────────────────
export function initDb() {
  const parentDir = path.dirname(dbPath);
  if (!fs.existsSync(parentDir)) {
    try {
      fs.mkdirSync(parentDir, { recursive: true });
    } catch {}
  }

  if (!fs.existsSync(dbPath)) {
    const recovered = tryRecoverFromBackup();
    if (!recovered) {
      try {
        fs.writeFileSync(dbPath, JSON.stringify(initialData, null, 2), 'utf8');
        console.log('[UniãoPet DB] Initialized at:', dbPath);
      } catch (e) {
        console.error('[UniãoPet DB] Failed to create initial DB file:', e);
      }
    }
  }

  loadDbData();
  createBackup('boot');
}

function loadDbData() {
  try {
    if (fs.existsSync(dbPath)) {
      const raw = fs.readFileSync(dbPath, 'utf8');
      if (raw.trim().length === 0) {
        console.warn('[UniãoPet DB] File is 0 bytes, attempting auto-recovery...');
        if (tryRecoverFromBackup()) {
          const restoredRaw = fs.readFileSync(dbPath, 'utf8');
          cachedData = normalizeSchema(JSON.parse(restoredRaw));
          return;
        }
      }
      const parsed = JSON.parse(raw);
      cachedData = normalizeSchema(parsed);
    } else {
      cachedData = { ...initialData };
    }
  } catch (error) {
    console.error('[UniãoPet DB] Error reading DB file, attempting backup recovery:', error);
    if (tryRecoverFromBackup()) {
      try {
        const restoredRaw = fs.readFileSync(dbPath, 'utf8');
        cachedData = normalizeSchema(JSON.parse(restoredRaw));
        return;
      } catch {}
    }
    if (!cachedData) cachedData = { ...initialData };
  }
}

function getDbData() {
  if (!cachedData) {
    loadDbData();
  }
  return cachedData;
}

// Debounced, Non-Blocking Atomic File Persistence with Blank Overwrite Protection
function queueWrite() {
  if (saveTimeout) clearTimeout(saveTimeout);
  saveTimeout = setTimeout(() => {
    persistToDiskAsync();
  }, 100);
}

function persistToDiskAsync() {
  if (!cachedData || isSaving) return;
  isSaving = true;

  try {
    if (fs.existsSync(dbPath)) {
      try {
        const diskRaw = fs.readFileSync(dbPath, 'utf8');
        if (diskRaw.trim().length > 0) {
          const diskParsed = JSON.parse(diskRaw);
          if (
            Array.isArray(diskParsed.users) &&
            diskParsed.users.length > 0 &&
            cachedData.users.length === 0
          ) {
            console.error('[CRITICAL GUARD] Attempted to write empty users over non-empty database! Write aborted.');
            isSaving = false;
            return;
          }
        }
      } catch {}
    }

    const tempPath = `${dbPath}.tmp`;
    const jsonString = JSON.stringify(cachedData, null, 2);
    fs.writeFileSync(tempPath, jsonString, 'utf8');
    fs.renameSync(tempPath, dbPath);
  } catch (err) {
    console.error('Error persisting UniãoPET DB to disk:', err);
  } finally {
    isSaving = false;
  }
}

export function exportDb() {
  return getDbData();
}

export function restoreDb(jsonData) {
  try {
    const normalized = normalizeSchema(jsonData);
    if (!Array.isArray(normalized.users)) {
      return { success: false, message: 'Arquivo inválido: coleção de usuários ausente.' };
    }
    createBackup('pre_restore');
    cachedData = normalized;
    persistToDiskAsync();
    console.log('[UniãoPet Backup] Database restored successfully from uploaded file.');
    return { success: true, message: 'Dados restaurados com sucesso!' };
  } catch (e) {
    return { success: false, message: e.message || 'Erro ao processar dados de restauração.' };
  }
}

export function getDbStats() {
  const data = getDbData();
  return {
    dbPath,
    dataDir: DATA_DIR,
    backupsDir: BACKUPS_DIR,
    usersCount: data.users?.length || 0,
    postsCount: data.posts?.length || 0,
    petsCount: data.pets?.length || 0,
    conversationsCount: data.conversations?.length || 0,
    messagesCount: data.messages?.length || 0,
    backupsCount: listBackups().length
  };
}

export function listBackups() {
  try {
    if (!fs.existsSync(BACKUPS_DIR)) return [];
    return fs.readdirSync(BACKUPS_DIR)
      .filter(f => f.startsWith('uniao_pet_db_') && f.endsWith('.json'))
      .map(f => {
        const fullPath = path.join(BACKUPS_DIR, f);
        const stats = fs.statSync(fullPath);
        return {
          filename: f,
          sizeBytes: stats.size,
          createdAt: stats.birthtime.toISOString(),
          updatedAt: stats.mtime.toISOString()
        };
      })
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  } catch {
    return [];
  }
}

export const db = {
  getUsers: () => getDbData().users,
  getUserByEmail: (email) => getDbData().users.find(u => u.email === email),
  insertUser: (user) => {
    const data = getDbData();
    data.users.push(user);
    queueWrite();
    return user;
  },
  updateUser: (email, updates) => {
    const data = getDbData();
    const index = data.users.findIndex(u => u.email === email);
    if (index !== -1) {
      data.users[index] = { ...data.users[index], ...updates };
      queueWrite();
      return data.users[index];
    }
    return null;
  },
  updateUserLastSeen: (email) => {
    if (!email) return null;
    const data = getDbData();
    const user = data.users.find(u => u.email === email);
    if (user) {
      user.lastSeen = Date.now();
      queueWrite();
      return user;
    }
    return null;
  },

  getPosts: () => getDbData().posts,
  getPostById: (id) => getDbData().posts.find(p => p.id === id),
  insertPost: (post) => {
    const data = getDbData();
    data.posts.unshift(post);
    queueWrite();
    return post;
  },
  updatePost: (id, updates) => {
    const data = getDbData();
    const index = data.posts.findIndex(p => p.id === id);
    if (index !== -1) {
      data.posts[index] = { ...data.posts[index], ...updates };
      queueWrite();
      return data.posts[index];
    }
    return null;
  },
  deletePost: (id) => {
    const data = getDbData();
    data.posts = data.posts.filter(p => p.id !== id);
    data.comments = data.comments.filter(c => c.postId !== id);
    queueWrite();
  },

  togglePostLike: (postId, userEmail) => {
    const data = getDbData();
    const index = data.posts.findIndex(p => p.id === postId);
    if (index === -1) return null;

    const post = data.posts[index];
    const likedBy = post.likedBy || [];
    const alreadyLiked = likedBy.includes(userEmail);

    const newLikedBy = alreadyLiked
      ? likedBy.filter(e => e !== userEmail)
      : [...likedBy, userEmail];

    data.posts[index] = {
      ...post,
      likedBy: newLikedBy,
      likes: newLikedBy.length
    };
    queueWrite();
    return data.posts[index];
  },

  getCommentsByPostId: (postId) => getDbData().comments.filter(c => c.postId === postId),
  insertComment: (comment) => {
    const data = getDbData();
    data.comments.push(comment);
    queueWrite();
    return comment;
  },

  getConversations: () => getDbData().conversations,
  getConversationsByParticipant: (userEmail) => {
    const conversations = getDbData().conversations;
    return conversations.filter(c => {
      if (!c.participants || c.participants.length === 0) return true;
      return c.participants.includes(userEmail);
    });
  },
  getConversationById: (id) => getDbData().conversations.find(c => c.id === id),
  insertConversation: (conversation) => {
    const data = getDbData();
    data.conversations.unshift(conversation);
    queueWrite();
    return conversation;
  },
  updateConversation: (id, updates) => {
    const data = getDbData();
    const index = data.conversations.findIndex(c => c.id === id);
    if (index !== -1) {
      data.conversations[index] = { ...data.conversations[index], ...updates };
      queueWrite();
      return data.conversations[index];
    }
    return null;
  },

  deleteConversation: (id) => {
    const data = getDbData();
    data.conversations = data.conversations.filter(c => c.id !== id);
    data.messages = data.messages.filter(m => m.conversationId !== id);
    queueWrite();
  },

  markConversationRead: (convId, userEmail) => {
    const data = getDbData();
    const index = data.conversations.findIndex(c => c.id === convId);
    if (index !== -1) {
      const unreadFor = data.conversations[index].unreadFor || [];
      data.conversations[index] = {
        ...data.conversations[index],
        unreadFor: unreadFor.filter(e => e !== userEmail)
      };
      queueWrite();
    }
  },

  addToUnreadFor: (convId, userEmail) => {
    const data = getDbData();
    const index = data.conversations.findIndex(c => c.id === convId);
    if (index !== -1) {
      const unreadFor = data.conversations[index].unreadFor || [];
      if (!unreadFor.includes(userEmail)) {
        data.conversations[index] = {
          ...data.conversations[index],
          unreadFor: [...unreadFor, userEmail]
        };
        queueWrite();
      }
    }
  },

  getMessagesByConversationId: (conversationId) =>
    getDbData().messages.filter(m => m.conversationId === conversationId),
  insertMessage: (message) => {
    const data = getDbData();
    data.messages.push(message);
    queueWrite();
    return message;
  },

  getFollowing: (userEmail) => getDbData().following.filter(f => f.follower === userEmail),
  insertFollowing: (follower, targetEmail) => {
    const data = getDbData();
    if (!data.following.some(f => f.follower === follower && f.target === targetEmail)) {
      data.following.push({ follower, target: targetEmail });
      queueWrite();
    }
  },
  removeFollowing: (follower, targetEmail) => {
    const data = getDbData();
    data.following = data.following.filter(
      f => !(f.follower === follower && f.target === targetEmail)
    );
    queueWrite();
  },

  togglePostStatus: (postId, status) => {
    const data = getDbData();
    const index = data.posts.findIndex(p => p.id === postId);
    if (index === -1) return null;
    const current = data.posts[index].status || 'ativo';
    const next = status || (current === 'resolvido' ? 'ativo' : 'resolvido');
    data.posts[index] = { ...data.posts[index], status: next };
    queueWrite();
    return data.posts[index];
  },

  getPets: (ownerEmail) => {
    const pets = getDbData().pets || [];
    if (ownerEmail) {
      return pets.filter(p => p.ownerEmail === ownerEmail);
    }
    return pets;
  },
  getPetById: (id) => {
    const pets = getDbData().pets || [];
    return pets.find(p => p.id === id);
  },
  insertPet: (pet) => {
    const data = getDbData();
    if (!data.pets) data.pets = [];
    data.pets.unshift(pet);
    queueWrite();
    return pet;
  },
  updatePet: (id, updates) => {
    const data = getDbData();
    if (!data.pets) data.pets = [];
    const index = data.pets.findIndex(p => p.id === id);
    if (index !== -1) {
      data.pets[index] = { ...data.pets[index], ...updates };
      queueWrite();
      return data.pets[index];
    }
    return null;
  },
  deletePet: (id) => {
    const data = getDbData();
    if (!data.pets) data.pets = [];
    data.pets = data.pets.filter(p => p.id !== id);
    queueWrite();
  },
  addVaccine: (petId, vaccine) => {
    const data = getDbData();
    if (!data.pets) data.pets = [];
    const pet = data.pets.find(p => p.id === petId);
    if (!pet) return null;
    if (!pet.vaccines) pet.vaccines = [];
    pet.vaccines.push(vaccine);
    queueWrite();
    return vaccine;
  },
  updateVaccine: (petId, vaccineId, updates) => {
    const data = getDbData();
    if (!data.pets) data.pets = [];
    const pet = data.pets.find(p => p.id === petId);
    if (!pet || !pet.vaccines) return null;
    const vIndex = pet.vaccines.findIndex(v => v.id === vaccineId);
    if (vIndex !== -1) {
      pet.vaccines[vIndex] = { ...pet.vaccines[vIndex], ...updates };
      queueWrite();
      return pet.vaccines[vIndex];
    }
    return null;
  },
  deleteVaccine: (petId, vaccineId) => {
    const data = getDbData();
    if (!data.pets) data.pets = [];
    const pet = data.pets.find(p => p.id === petId);
    if (!pet || !pet.vaccines) return false;
    pet.vaccines = pet.vaccines.filter(v => v.id !== vaccineId);
    queueWrite();
    return true;
  },

  // ── Pet Medications ──────────────────────────────────────────────────────
  addMedication: (petId, medication) => {
    const data = getDbData();
    if (!data.pets) data.pets = [];
    const pet = data.pets.find(p => p.id === petId);
    if (!pet) return null;
    if (!pet.medications) pet.medications = [];
    pet.medications.push(medication);
    queueWrite();
    return medication;
  },
  updateMedication: (petId, medId, updates) => {
    const data = getDbData();
    if (!data.pets) data.pets = [];
    const pet = data.pets.find(p => p.id === petId);
    if (!pet || !pet.medications) return null;
    const mIndex = pet.medications.findIndex(m => m.id === medId);
    if (mIndex !== -1) {
      pet.medications[mIndex] = { ...pet.medications[mIndex], ...updates };
      queueWrite();
      return pet.medications[mIndex];
    }
    return null;
  },
  deleteMedication: (petId, medId) => {
    const data = getDbData();
    if (!data.pets) data.pets = [];
    const pet = data.pets.find(p => p.id === petId);
    if (!pet || !pet.medications) return false;
    pet.medications = pet.medications.filter(m => m.id !== medId);
    queueWrite();
    return true;
  },
  toggleMedicationTaken: (petId, medId, dateStr) => {
    const data = getDbData();
    if (!data.pets) data.pets = [];
    const pet = data.pets.find(p => p.id === petId);
    if (!pet || !pet.medications) return null;
    const med = pet.medications.find(m => m.id === medId);
    if (!med) return null;
    if (!med.takenDates) med.takenDates = [];
    const idx = med.takenDates.indexOf(dateStr);
    if (idx !== -1) {
      med.takenDates.splice(idx, 1);
      med.lastTakenDate = med.takenDates[med.takenDates.length - 1] || undefined;
    } else {
      med.takenDates.push(dateStr);
      med.lastTakenDate = dateStr;
    }
    queueWrite();
    return med;
  },

  // ── Pet Weight History ───────────────────────────────────────────────────
  addWeightRecord: (petId, record) => {
    const data = getDbData();
    if (!data.pets) data.pets = [];
    const pet = data.pets.find(p => p.id === petId);
    if (!pet) return null;
    if (!pet.weightHistory) pet.weightHistory = [];
    pet.weightHistory.unshift(record);
    pet.weight = `${record.weightKg} kg`;
    queueWrite();
    return record;
  },
  deleteWeightRecord: (petId, recordId) => {
    const data = getDbData();
    if (!data.pets) data.pets = [];
    const pet = data.pets.find(p => p.id === petId);
    if (!pet || !pet.weightHistory) return false;
    pet.weightHistory = pet.weightHistory.filter(w => w.id !== recordId);
    queueWrite();
    return true;
  },

  // ── Saved Posts (Bookmarks) ──────────────────────────────────────────────
  getSavedPosts: (userEmail) => {
    const user = getDbData().users?.find(u => u.email === userEmail);
    return user?.savedPosts || [];
  },
  toggleSavedPost: (userEmail, postId) => {
    const data = getDbData();
    const user = data.users?.find(u => u.email === userEmail);
    if (!user) return [];
    if (!user.savedPosts) user.savedPosts = [];
    const idx = user.savedPosts.indexOf(postId);
    if (idx !== -1) {
      user.savedPosts.splice(idx, 1);
    } else {
      user.savedPosts.push(postId);
    }
    queueWrite();
    return user.savedPosts;
  },

  // ── Emergency Vet Contact ────────────────────────────────────────────────
  getEmergencyVet: (userEmail) => {
    const user = getDbData().users?.find(u => u.email === userEmail);
    return user?.emergencyVet || null;
  },
  updateEmergencyVet: (userEmail, contact) => {
    const data = getDbData();
    const user = data.users?.find(u => u.email === userEmail);
    if (!user) return null;
    user.emergencyVet = contact;
    queueWrite();
    return user.emergencyVet;
  }
};

