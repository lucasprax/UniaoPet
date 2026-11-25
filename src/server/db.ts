import fs from 'fs';
import path from 'path';
import pg from 'pg';

const { Pool } = pg;

// ── Types & Defaults ─────────────────────────────────────────────────────────
export interface Revisions {
  global: number;
  posts: number;
  conversations: number;
  pets: number;
  users: number;
}

const initialData = {
  users: [] as any[],
  posts: [] as any[],
  comments: [] as any[],
  conversations: [] as any[],
  messages: [] as any[],
  following: [] as any[],
  pets: [] as any[]
};

// ── Mode Detection (Postgres on Vercel / Cloud vs Local JSON) ────────────────
function getConnectionString(): string {
  return (
    process.env.DATABASE_URL ||
    process.env.POSTGRES_URL ||
    process.env.POSTGRES_PRISMA_URL ||
    ''
  ).trim();
}

export function isPostgresMode(): boolean {
  return getConnectionString().length > 0;
}

export function getDbMode(): 'postgres' | 'local-json' | 'unconfigured' {
  if (isPostgresMode()) return 'postgres';
  if (process.env.VERCEL) return 'unconfigured';
  return 'local-json';
}

// ── Non-Destructive Schema Normalizer ────────────────────────────────────────
function normalizeSchema(raw: any) {
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

  normalized.users = normalized.users.map((u: any) => ({
    ...u,
    savedPosts: Array.isArray(u.savedPosts) ? u.savedPosts : []
  }));

  normalized.posts = normalized.posts.map((p: any) => ({
    ...p,
    likes: typeof p.likes === 'number' ? p.likes : 0,
    likedBy: Array.isArray(p.likedBy) ? p.likedBy : [],
    status: p.status || 'ativo'
  }));

  normalized.pets = normalized.pets.map((pet: any) => ({
    ...pet,
    vaccines: Array.isArray(pet.vaccines) ? pet.vaccines : [],
    medications: Array.isArray(pet.medications) ? pet.medications : [],
    weightHistory: Array.isArray(pet.weightHistory) ? pet.weightHistory : []
  }));

  return normalized;
}

// ═════════════════════════════════════════════════════════════════════════════
// POSTGRES DRIVER (Vercel Serverless / Neon / Supabase / Any Postgres)
// ═════════════════════════════════════════════════════════════════════════════
let pgPool: pg.Pool | null = null;
let pgSchemaReady: Promise<void> | null = null;
const presenceThrottle = new Map<string, number>();

function getPool(): pg.Pool {
  if (!pgPool) {
    const connectionString = getConnectionString();
    if (!connectionString) {
      throw new Error(
        'Banco de dados não configurado. Conecte um Postgres na aba Storage da Vercel (DATABASE_URL).'
      );
    }
    const isLocal =
      connectionString.includes('localhost') ||
      connectionString.includes('127.0.0.1') ||
      connectionString.includes('sslmode=disable');

    pgPool = new Pool({
      connectionString,
      ssl: isLocal ? false : { rejectUnauthorized: false },
      max: 5,
      idleTimeoutMillis: 15000,
      connectionTimeoutMillis: 10000
    });
  }
  return pgPool;
}

async function ensurePgSchema(): Promise<void> {
  if (pgSchemaReady) return pgSchemaReady;
  pgSchemaReady = (async () => {
    const pool = getPool();
    await pool.query(`
      CREATE TABLE IF NOT EXISTS up_users (
        email TEXT PRIMARY KEY,
        data JSONB NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS up_posts (
        id TEXT PRIMARY KEY,
        seq BIGSERIAL,
        data JSONB NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS up_comments (
        id TEXT PRIMARY KEY,
        post_id TEXT NOT NULL,
        seq BIGSERIAL,
        data JSONB NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_up_comments_post_id ON up_comments (post_id);

      CREATE TABLE IF NOT EXISTS up_conversations (
        id TEXT PRIMARY KEY,
        seq BIGSERIAL,
        data JSONB NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS up_messages (
        id TEXT PRIMARY KEY,
        conversation_id TEXT NOT NULL,
        seq BIGSERIAL,
        data JSONB NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_up_messages_conv_id ON up_messages (conversation_id);

      CREATE TABLE IF NOT EXISTS up_following (
        follower_lower TEXT NOT NULL,
        target_lower TEXT NOT NULL,
        follower TEXT NOT NULL,
        target TEXT NOT NULL,
        PRIMARY KEY (follower_lower, target_lower)
      );

      CREATE TABLE IF NOT EXISTS up_pets (
        id TEXT PRIMARY KEY,
        owner_email TEXT NOT NULL,
        seq BIGSERIAL,
        data JSONB NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_up_pets_owner ON up_pets (owner_email);

      CREATE TABLE IF NOT EXISTS up_meta (
        key TEXT PRIMARY KEY,
        value BIGINT NOT NULL DEFAULT 1
      );

      INSERT INTO up_meta (key, value) VALUES
        ('global', 1),
        ('posts', 1),
        ('conversations', 1),
        ('pets', 1),
        ('users', 1)
      ON CONFLICT (key) DO NOTHING;
    `);
  })().catch((err) => {
    pgSchemaReady = null;
    throw err;
  });
  return pgSchemaReady;
}

async function pgBumpRevision(type?: 'posts' | 'conversations' | 'pets' | 'users'): Promise<void> {
  const pool = getPool();
  if (type) {
    await pool.query(
      `INSERT INTO up_meta (key, value) VALUES ('global', 2), ($1, 2)
       ON CONFLICT (key) DO UPDATE SET value = up_meta.value + 1`,
      [type]
    );
  } else {
    await pool.query(
      `INSERT INTO up_meta (key, value) VALUES ('global', 2)
       ON CONFLICT (key) DO UPDATE SET value = up_meta.value + 1`
    );
  }
}

async function pgGetRevisions(): Promise<Revisions> {
  await ensurePgSchema();
  const { rows } = await getPool().query(`SELECT key, value FROM up_meta`);
  const rev: Revisions = { global: 1, posts: 1, conversations: 1, pets: 1, users: 1 };
  for (const row of rows) {
    if (row.key in rev) {
      (rev as any)[row.key] = Number(row.value) || 1;
    }
  }
  return rev;
}

// ═════════════════════════════════════════════════════════════════════════════
// LOCAL JSON FILE DRIVER (Development & VPS fallback)
// ═════════════════════════════════════════════════════════════════════════════
const DATA_DIR = process.env.DATA_DIR || path.resolve(process.cwd(), 'data');
const BACKUPS_DIR = path.join(DATA_DIR, 'backups');

function resolveDbPath(): string {
  if (process.env.DB_PATH) {
    return path.resolve(process.cwd(), process.env.DB_PATH);
  }

  const inDataDir = path.join(DATA_DIR, 'uniao_pet_db.json');
  const inRootDir = path.resolve(process.cwd(), 'uniao_pet_db.json');

  if (fs.existsSync(inDataDir)) return inDataDir;

  if (fs.existsSync(inRootDir)) {
    try {
      if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
      fs.copyFileSync(inRootDir, inDataDir);
      console.log(`[UniãoPet DB] Migrated database file safely from root to ${inDataDir}`);
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

let dbPath = '';
let cachedData: any = null;
let saveTimeout: NodeJS.Timeout | null = null;
let isSaving = false;
let localInitialized = false;

export const revisions: Revisions = {
  global: 1,
  posts: 1,
  conversations: 1,
  pets: 1,
  users: 1
};

function localBumpRevision(type?: 'posts' | 'conversations' | 'pets' | 'users') {
  revisions.global++;
  if (type) revisions[type]++;
}

const indexStore = {
  usersByEmail: new Map<string, any>(),
  postsById: new Map<string, any>(),
  commentsByPostId: new Map<string, any[]>(),
  conversationsById: new Map<string, any>(),
  messagesByConvId: new Map<string, any[]>(),
  petsById: new Map<string, any>(),
  petsByOwner: new Map<string, any[]>()
};

function rebuildIndices(data: any) {
  indexStore.usersByEmail.clear();
  indexStore.postsById.clear();
  indexStore.commentsByPostId.clear();
  indexStore.conversationsById.clear();
  indexStore.messagesByConvId.clear();
  indexStore.petsById.clear();
  indexStore.petsByOwner.clear();

  if (Array.isArray(data.users)) {
    data.users.forEach((u: any) => {
      if (u && u.email) indexStore.usersByEmail.set(u.email.toLowerCase(), u);
    });
  }

  if (Array.isArray(data.posts)) {
    data.posts.forEach((p: any) => {
      if (p && p.id) indexStore.postsById.set(p.id, p);
    });
  }

  if (Array.isArray(data.comments)) {
    data.comments.forEach((c: any) => {
      if (c && c.postId) {
        let list = indexStore.commentsByPostId.get(c.postId);
        if (!list) {
          list = [];
          indexStore.commentsByPostId.set(c.postId, list);
        }
        list.push(c);
      }
    });
  }

  if (Array.isArray(data.conversations)) {
    data.conversations.forEach((conv: any) => {
      if (conv && conv.id) indexStore.conversationsById.set(conv.id, conv);
    });
  }

  if (Array.isArray(data.messages)) {
    data.messages.forEach((m: any) => {
      if (m && m.conversationId) {
        let list = indexStore.messagesByConvId.get(m.conversationId);
        if (!list) {
          list = [];
          indexStore.messagesByConvId.set(m.conversationId, list);
        }
        list.push(m);
      }
    });
  }

  if (Array.isArray(data.pets)) {
    data.pets.forEach((pet: any) => {
      if (pet && pet.id) indexStore.petsById.set(pet.id, pet);
      if (pet && pet.ownerEmail) {
        const owner = pet.ownerEmail.toLowerCase();
        let list = indexStore.petsByOwner.get(owner);
        if (!list) {
          list = [];
          indexStore.petsByOwner.set(owner, list);
        }
        list.push(pet);
      }
    });
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

function tryRecoverFromBackup(): boolean {
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

function createLocalBackup(prefix = 'auto'): string | null {
  try {
    if (!dbPath) dbPath = resolveDbPath();
    if (!fs.existsSync(BACKUPS_DIR)) fs.mkdirSync(BACKUPS_DIR, { recursive: true });
    if (!fs.existsSync(dbPath)) return null;

    const stat = fs.statSync(dbPath);
    if (stat.size === 0) return null;

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupFile = path.join(BACKUPS_DIR, `uniao_pet_db_${prefix}_${timestamp}.json`);
    fs.copyFileSync(dbPath, backupFile);
    pruneOldBackups(15);
    return backupFile;
  } catch (err) {
    console.error('[UniãoPet Backup] Error creating backup:', err);
    return null;
  }
}

function loadLocalDbData() {
  if (!dbPath) dbPath = resolveDbPath();
  try {
    if (fs.existsSync(dbPath)) {
      const raw = fs.readFileSync(dbPath, 'utf8');
      if (raw.trim().length === 0) {
        if (tryRecoverFromBackup()) {
          const restoredRaw = fs.readFileSync(dbPath, 'utf8');
          cachedData = normalizeSchema(JSON.parse(restoredRaw));
          rebuildIndices(cachedData);
          return;
        }
      }
      cachedData = normalizeSchema(JSON.parse(raw));
    } else {
      cachedData = normalizeSchema(initialData);
    }
  } catch (error) {
    console.error('[UniãoPet DB] Error reading/parsing DB file:', error);
    if (tryRecoverFromBackup()) {
      try {
        const restoredRaw = fs.readFileSync(dbPath, 'utf8');
        cachedData = normalizeSchema(JSON.parse(restoredRaw));
        rebuildIndices(cachedData);
        return;
      } catch {}
    }
    if (!cachedData) cachedData = normalizeSchema(initialData);
  }
  rebuildIndices(cachedData);
}

function ensureLocalInit() {
  if (process.env.VERCEL && !isPostgresMode()) {
    throw new Error(
      'Banco de dados não configurado na Vercel. Crie um Postgres na aba Storage da Vercel para gerar DATABASE_URL.'
    );
  }
  if (localInitialized && cachedData) return;
  dbPath = resolveDbPath();
  const parentDir = path.dirname(dbPath);
  if (!fs.existsSync(parentDir)) {
    try { fs.mkdirSync(parentDir, { recursive: true }); } catch {}
  }
  if (!fs.existsSync(dbPath)) {
    const recovered = tryRecoverFromBackup();
    if (!recovered) {
      try {
        fs.writeFileSync(dbPath, JSON.stringify(initialData), 'utf8');
      } catch (e) {
        console.error('[UniãoPet DB] Failed to create initial DB file:', e);
      }
    }
  }
  loadLocalDbData();
  createLocalBackup('boot');
  localInitialized = true;
}

function getLocalData() {
  ensureLocalInit();
  return cachedData;
}

function queueLocalWrite() {
  localBumpRevision();
  if (saveTimeout) clearTimeout(saveTimeout);
  saveTimeout = setTimeout(() => {
    persistToDiskAsync();
  }, 120);
}

async function persistToDiskAsync() {
  if (!cachedData || isSaving || !dbPath) return;
  isSaving = true;
  try {
    if (cachedData.users.length === 0 && fs.existsSync(dbPath)) {
      try {
        const stat = await fs.promises.stat(dbPath);
        if (stat.size > 200) {
          console.error('[CRITICAL GUARD] Attempted to write empty users over non-empty database! Write aborted.');
          isSaving = false;
          return;
        }
      } catch {}
    }

    const tempPath = `${dbPath}.tmp`;
    await fs.promises.writeFile(tempPath, JSON.stringify(cachedData), 'utf8');
    await fs.promises.rename(tempPath, dbPath);
  } catch (err) {
    console.error('Error writing DB atomically to disk:', err);
  } finally {
    isSaving = false;
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// PUBLIC LIFECYCLE, REVISIONS, BACKUP & STATS API
// ═════════════════════════════════════════════════════════════════════════════
export async function initDb(): Promise<void> {
  if (isPostgresMode()) {
    await ensurePgSchema();
    return;
  }
  if (process.env.VERCEL) {
    console.warn('[UniãoPet DB] Running on Vercel without DATABASE_URL configured yet.');
    return;
  }
  ensureLocalInit();
}

export async function getRevisions(): Promise<Revisions> {
  if (isPostgresMode()) {
    return pgGetRevisions();
  }
  ensureLocalInit();
  return { ...revisions };
}

export async function createBackup(prefix = 'auto'): Promise<string | null> {
  if (isPostgresMode()) {
    return `postgres-managed-${prefix}-${new Date().toISOString()}`;
  }
  ensureLocalInit();
  return createLocalBackup(prefix);
}

export async function listBackups(): Promise<Array<{
  filename: string;
  sizeBytes: number;
  createdAt: string;
  updatedAt: string;
}>> {
  if (isPostgresMode()) return [];
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

export async function exportDb() {
  if (isPostgresMode()) {
    await ensurePgSchema();
    const pool = getPool();
    const [usersR, postsR, commentsR, convsR, msgsR, followR, petsR] = await Promise.all([
      pool.query(`SELECT data FROM up_users ORDER BY updated_at ASC`),
      pool.query(`SELECT data FROM up_posts ORDER BY seq DESC`),
      pool.query(`SELECT data FROM up_comments ORDER BY seq ASC`),
      pool.query(`SELECT data FROM up_conversations ORDER BY updated_at DESC, seq DESC`),
      pool.query(`SELECT data FROM up_messages ORDER BY seq ASC`),
      pool.query(`SELECT follower, target FROM up_following`),
      pool.query(`SELECT data FROM up_pets ORDER BY seq DESC`)
    ]);
    return {
      users: usersR.rows.map(r => r.data),
      posts: postsR.rows.map(r => r.data),
      comments: commentsR.rows.map(r => r.data),
      conversations: convsR.rows.map(r => r.data),
      messages: msgsR.rows.map(r => r.data),
      following: followR.rows.map(r => ({ follower: r.follower, target: r.target })),
      pets: petsR.rows.map(r => r.data)
    };
  }
  return getLocalData();
}

export async function restoreDb(jsonData: any): Promise<{ success: boolean; message: string }> {
  try {
    const normalized = normalizeSchema(jsonData);
    if (!Array.isArray(normalized.users)) {
      return { success: false, message: 'Arquivo inválido: coleção de usuários ausente.' };
    }

    if (isPostgresMode()) {
      await ensurePgSchema();
      const client = await getPool().connect();
      try {
        await client.query('BEGIN');
        await client.query(`
          TRUNCATE up_users, up_posts, up_comments, up_conversations, up_messages, up_following, up_pets
          RESTART IDENTITY
        `);

        for (const u of normalized.users) {
          if (!u?.email) continue;
          await client.query(
            `INSERT INTO up_users (email, data) VALUES ($1, $2::jsonb)
             ON CONFLICT (email) DO UPDATE SET data = EXCLUDED.data, updated_at = NOW()`,
            [u.email.toLowerCase(), JSON.stringify(u)]
          );
        }

        // Insert newest-first collections in reverse so ORDER BY seq DESC preserves exact order
        for (let i = normalized.posts.length - 1; i >= 0; i--) {
          const p = normalized.posts[i];
          if (!p?.id) continue;
          await client.query(
            `INSERT INTO up_posts (id, data) VALUES ($1, $2::jsonb)
             ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data`,
            [p.id, JSON.stringify(p)]
          );
        }

        for (const c of normalized.comments) {
          if (!c?.id || !c?.postId) continue;
          await client.query(
            `INSERT INTO up_comments (id, post_id, data) VALUES ($1, $2, $3::jsonb)
             ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data`,
            [c.id, c.postId, JSON.stringify(c)]
          );
        }

        for (let i = normalized.conversations.length - 1; i >= 0; i--) {
          const conv = normalized.conversations[i];
          if (!conv?.id) continue;
          await client.query(
            `INSERT INTO up_conversations (id, data) VALUES ($1, $2::jsonb)
             ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated_at = NOW()`,
            [conv.id, JSON.stringify(conv)]
          );
        }

        for (const m of normalized.messages) {
          if (!m?.id || !m?.conversationId) continue;
          await client.query(
            `INSERT INTO up_messages (id, conversation_id, data) VALUES ($1, $2, $3::jsonb)
             ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data`,
            [m.id, m.conversationId, JSON.stringify(m)]
          );
        }

        for (const f of normalized.following) {
          if (!f?.follower || !f?.target) continue;
          await client.query(
            `INSERT INTO up_following (follower_lower, target_lower, follower, target)
             VALUES ($1, $2, $3, $4)
             ON CONFLICT (follower_lower, target_lower) DO NOTHING`,
            [f.follower.toLowerCase(), f.target.toLowerCase(), f.follower, f.target]
          );
        }

        for (let i = normalized.pets.length - 1; i >= 0; i--) {
          const pet = normalized.pets[i];
          if (!pet?.id) continue;
          await client.query(
            `INSERT INTO up_pets (id, owner_email, data) VALUES ($1, $2, $3::jsonb)
             ON CONFLICT (id) DO UPDATE SET owner_email = EXCLUDED.owner_email, data = EXCLUDED.data`,
            [pet.id, (pet.ownerEmail || '').toLowerCase(), JSON.stringify(pet)]
          );
        }

        await client.query(`UPDATE up_meta SET value = value + 1`);
        await client.query('COMMIT');
        return { success: true, message: 'Dados restaurados no Postgres com sucesso!' };
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    }

    ensureLocalInit();
    createLocalBackup('pre_restore');
    cachedData = normalized;
    rebuildIndices(cachedData);
    localBumpRevision();
    await persistToDiskAsync();
    return { success: true, message: 'Dados restaurados com sucesso!' };
  } catch (e: any) {
    return { success: false, message: e.message || 'Erro ao processar dados de restauração.' };
  }
}

export async function getDbStats() {
  if (isPostgresMode()) {
    await ensurePgSchema();
    const pool = getPool();
    const [counts, revs] = await Promise.all([
      pool.query(`
        SELECT
          (SELECT COUNT(*) FROM up_users)::int AS users_count,
          (SELECT COUNT(*) FROM up_posts)::int AS posts_count,
          (SELECT COUNT(*) FROM up_pets)::int AS pets_count,
          (SELECT COUNT(*) FROM up_conversations)::int AS conversations_count,
          (SELECT COUNT(*) FROM up_messages)::int AS messages_count
      `),
      pgGetRevisions()
    ]);
    const row = counts.rows[0];
    return {
      mode: 'postgres',
      dbPath: 'PostgreSQL (Vercel / Cloud)',
      dataDir: 'PostgreSQL',
      backupsDir: 'Download JSON sob demanda',
      usersCount: row.users_count,
      postsCount: row.posts_count,
      petsCount: row.pets_count,
      conversationsCount: row.conversations_count,
      messagesCount: row.messages_count,
      backupsCount: 0,
      revisions: revs
    };
  }

  const data = getLocalData();
  const backups = await listBackups();
  return {
    mode: 'local-json',
    dbPath,
    dataDir: DATA_DIR,
    backupsDir: BACKUPS_DIR,
    usersCount: data.users?.length || 0,
    postsCount: data.posts?.length || 0,
    petsCount: data.pets?.length || 0,
    conversationsCount: data.conversations?.length || 0,
    messagesCount: data.messages?.length || 0,
    backupsCount: backups.length,
    revisions: { ...revisions }
  };
}

// ═════════════════════════════════════════════════════════════════════════════
// UNIFIED ASYNC DATA ACCESS LAYER
// ═════════════════════════════════════════════════════════════════════════════
export const db = {
  // ── Users ────────────────────────────────────────────────────────────────
  getUsers: async (): Promise<any[]> => {
    if (isPostgresMode()) {
      await ensurePgSchema();
      const { rows } = await getPool().query(`SELECT data FROM up_users`);
      return rows.map(r => r.data);
    }
    return getLocalData().users;
  },

  getUserByEmail: async (email: string): Promise<any | null> => {
    if (!email) return null;
    if (isPostgresMode()) {
      await ensurePgSchema();
      const { rows } = await getPool().query(
        `SELECT data FROM up_users WHERE email = $1 LIMIT 1`,
        [email.toLowerCase()]
      );
      return rows[0]?.data || null;
    }
    ensureLocalInit();
    return indexStore.usersByEmail.get(email.toLowerCase()) || null;
  },

  insertUser: async (user: any): Promise<any> => {
    if (isPostgresMode()) {
      await ensurePgSchema();
      await getPool().query(
        `INSERT INTO up_users (email, data) VALUES ($1, $2::jsonb)`,
        [user.email.toLowerCase(), JSON.stringify(user)]
      );
      await pgBumpRevision('users');
      return user;
    }
    const data = getLocalData();
    data.users.push(user);
    if (user.email) indexStore.usersByEmail.set(user.email.toLowerCase(), user);
    localBumpRevision('users');
    queueLocalWrite();
    return user;
  },

  updateUser: async (email: string, updates: any): Promise<any | null> => {
    if (isPostgresMode()) {
      await ensurePgSchema();
      const lower = email.toLowerCase();
      const { rows } = await getPool().query(
        `UPDATE up_users
         SET data = data || $2::jsonb, updated_at = NOW()
         WHERE email = $1
         RETURNING data`,
        [lower, JSON.stringify(updates)]
      );
      if (rows.length === 0) return null;
      await pgBumpRevision('users');
      return rows[0].data;
    }
    const data = getLocalData();
    const index = data.users.findIndex((u: any) => u.email.toLowerCase() === email.toLowerCase());
    if (index !== -1) {
      data.users[index] = { ...data.users[index], ...updates };
      indexStore.usersByEmail.set(data.users[index].email.toLowerCase(), data.users[index]);
      localBumpRevision('users');
      queueLocalWrite();
      return data.users[index];
    }
    return null;
  },

  updateUserPresence: async (email: string): Promise<void> => {
    const lower = email.toLowerCase();
    const now = Date.now();
    if (isPostgresMode()) {
      const last = presenceThrottle.get(lower) || 0;
      if (now - last < 60_000) return;
      presenceThrottle.set(lower, now);
      try {
        await ensurePgSchema();
        await getPool().query(
          `UPDATE up_users SET data = jsonb_set(data, '{lastSeen}', to_jsonb($2::bigint), true) WHERE email = $1`,
          [lower, now]
        );
      } catch {}
      return;
    }
    if (process.env.VERCEL) return;
    ensureLocalInit();
    const user = indexStore.usersByEmail.get(lower);
    if (user) {
      user.lastSeen = now;
    }
  },

  // ── Posts ─────────────────────────────────────────────────────────────────
  getPosts: async (): Promise<any[]> => {
    if (isPostgresMode()) {
      await ensurePgSchema();
      const { rows } = await getPool().query(`SELECT data FROM up_posts ORDER BY seq DESC`);
      return rows.map(r => r.data);
    }
    return getLocalData().posts;
  },

  getPostById: async (id: string): Promise<any | null> => {
    if (isPostgresMode()) {
      await ensurePgSchema();
      const { rows } = await getPool().query(`SELECT data FROM up_posts WHERE id = $1 LIMIT 1`, [id]);
      return rows[0]?.data || null;
    }
    ensureLocalInit();
    return indexStore.postsById.get(id) || null;
  },

  insertPost: async (post: any): Promise<any> => {
    if (isPostgresMode()) {
      await ensurePgSchema();
      await getPool().query(
        `INSERT INTO up_posts (id, data) VALUES ($1, $2::jsonb)`,
        [post.id, JSON.stringify(post)]
      );
      await pgBumpRevision('posts');
      return post;
    }
    const data = getLocalData();
    data.posts.unshift(post);
    indexStore.postsById.set(post.id, post);
    localBumpRevision('posts');
    queueLocalWrite();
    return post;
  },

  updatePost: async (id: string, updates: any): Promise<any | null> => {
    if (isPostgresMode()) {
      await ensurePgSchema();
      const { rows } = await getPool().query(
        `UPDATE up_posts SET data = data || $2::jsonb WHERE id = $1 RETURNING data`,
        [id, JSON.stringify(updates)]
      );
      if (rows.length === 0) return null;
      await pgBumpRevision('posts');
      return rows[0].data;
    }
    const data = getLocalData();
    const index = data.posts.findIndex((p: any) => p.id === id);
    if (index !== -1) {
      data.posts[index] = { ...data.posts[index], ...updates };
      indexStore.postsById.set(id, data.posts[index]);
      localBumpRevision('posts');
      queueLocalWrite();
      return data.posts[index];
    }
    return null;
  },

  deletePost: async (id: string): Promise<void> => {
    if (isPostgresMode()) {
      await ensurePgSchema();
      const pool = getPool();
      await pool.query(`DELETE FROM up_comments WHERE post_id = $1`, [id]);
      await pool.query(`DELETE FROM up_posts WHERE id = $1`, [id]);
      await pgBumpRevision('posts');
      return;
    }
    const data = getLocalData();
    data.posts = data.posts.filter((p: any) => p.id !== id);
    data.comments = data.comments.filter((c: any) => c.postId !== id);
    indexStore.postsById.delete(id);
    indexStore.commentsByPostId.delete(id);
    localBumpRevision('posts');
    queueLocalWrite();
  },

  togglePostLike: async (postId: string, userEmail: string): Promise<any | null> => {
    if (isPostgresMode()) {
      await ensurePgSchema();
      const post = await db.getPostById(postId);
      if (!post) return null;
      const likedBy: string[] = Array.isArray(post.likedBy) ? post.likedBy : [];
      const alreadyLiked = likedBy.includes(userEmail);
      const newLikedBy = alreadyLiked
        ? likedBy.filter((e: string) => e !== userEmail)
        : [...likedBy, userEmail];
      const updated = { ...post, likedBy: newLikedBy, likes: newLikedBy.length };
      await getPool().query(
        `UPDATE up_posts SET data = $2::jsonb WHERE id = $1`,
        [postId, JSON.stringify(updated)]
      );
      await pgBumpRevision('posts');
      return updated;
    }
    const data = getLocalData();
    const index = data.posts.findIndex((p: any) => p.id === postId);
    if (index === -1) return null;

    const post = data.posts[index];
    const likedBy: string[] = post.likedBy || [];
    const alreadyLiked = likedBy.includes(userEmail);
    const newLikedBy = alreadyLiked
      ? likedBy.filter((e: string) => e !== userEmail)
      : [...likedBy, userEmail];

    data.posts[index] = { ...post, likedBy: newLikedBy, likes: newLikedBy.length };
    indexStore.postsById.set(postId, data.posts[index]);
    localBumpRevision('posts');
    queueLocalWrite();
    return data.posts[index];
  },

  togglePostStatus: async (postId: string, status?: string): Promise<any | null> => {
    if (isPostgresMode()) {
      const post = await db.getPostById(postId);
      if (!post) return null;
      const current = post.status || 'ativo';
      const next = status || (current === 'resolvido' ? 'ativo' : 'resolvido');
      return db.updatePost(postId, { status: next });
    }
    const data = getLocalData();
    const index = data.posts.findIndex((p: any) => p.id === postId);
    if (index === -1) return null;
    const current = data.posts[index].status || 'ativo';
    const next = status || (current === 'resolvido' ? 'ativo' : 'resolvido');
    data.posts[index] = { ...data.posts[index], status: next };
    indexStore.postsById.set(postId, data.posts[index]);
    localBumpRevision('posts');
    queueLocalWrite();
    return data.posts[index];
  },

  // ── Comments ──────────────────────────────────────────────────────────────
  getCommentsByPostId: async (postId: string): Promise<any[]> => {
    if (isPostgresMode()) {
      await ensurePgSchema();
      const { rows } = await getPool().query(
        `SELECT data FROM up_comments WHERE post_id = $1 ORDER BY seq ASC`,
        [postId]
      );
      return rows.map(r => r.data);
    }
    ensureLocalInit();
    return indexStore.commentsByPostId.get(postId) || [];
  },

  getAllCommentsGrouped: async (): Promise<Map<string, any[]>> => {
    if (isPostgresMode()) {
      await ensurePgSchema();
      const { rows } = await getPool().query(
        `SELECT post_id, data FROM up_comments ORDER BY seq ASC`
      );
      const map = new Map<string, any[]>();
      for (const row of rows) {
        let list = map.get(row.post_id);
        if (!list) {
          list = [];
          map.set(row.post_id, list);
        }
        list.push(row.data);
      }
      return map;
    }
    ensureLocalInit();
    return indexStore.commentsByPostId;
  },

  insertComment: async (comment: any): Promise<any> => {
    if (isPostgresMode()) {
      await ensurePgSchema();
      await getPool().query(
        `INSERT INTO up_comments (id, post_id, data) VALUES ($1, $2, $3::jsonb)`,
        [comment.id, comment.postId, JSON.stringify(comment)]
      );
      await pgBumpRevision('posts');
      return comment;
    }
    const data = getLocalData();
    data.comments.push(comment);
    let list = indexStore.commentsByPostId.get(comment.postId);
    if (!list) {
      list = [];
      indexStore.commentsByPostId.set(comment.postId, list);
    }
    list.push(comment);
    localBumpRevision('posts');
    queueLocalWrite();
    return comment;
  },

  // ── Conversations ─────────────────────────────────────────────────────────
  getConversations: async (): Promise<any[]> => {
    if (isPostgresMode()) {
      await ensurePgSchema();
      const { rows } = await getPool().query(
        `SELECT data FROM up_conversations ORDER BY updated_at DESC, seq DESC`
      );
      return rows.map(r => r.data);
    }
    return getLocalData().conversations;
  },

  getConversationsByParticipant: async (userEmail: string): Promise<any[]> => {
    const lower = userEmail.toLowerCase();
    const conversations = await db.getConversations();
    return conversations.filter((c: any) => {
      if (!c.participants || c.participants.length === 0) return true;
      return c.participants.some((p: string) => p && p.toLowerCase() === lower);
    });
  },

  getConversationById: async (id: string): Promise<any | null> => {
    if (isPostgresMode()) {
      await ensurePgSchema();
      const { rows } = await getPool().query(
        `SELECT data FROM up_conversations WHERE id = $1 LIMIT 1`,
        [id]
      );
      return rows[0]?.data || null;
    }
    ensureLocalInit();
    return indexStore.conversationsById.get(id) || null;
  },

  insertConversation: async (conversation: any): Promise<any> => {
    if (isPostgresMode()) {
      await ensurePgSchema();
      await getPool().query(
        `INSERT INTO up_conversations (id, data, updated_at) VALUES ($1, $2::jsonb, NOW())`,
        [conversation.id, JSON.stringify(conversation)]
      );
      await pgBumpRevision('conversations');
      return conversation;
    }
    const data = getLocalData();
    data.conversations.unshift(conversation);
    indexStore.conversationsById.set(conversation.id, conversation);
    localBumpRevision('conversations');
    queueLocalWrite();
    return conversation;
  },

  updateConversation: async (id: string, updates: any): Promise<any | null> => {
    if (isPostgresMode()) {
      await ensurePgSchema();
      const { rows } = await getPool().query(
        `UPDATE up_conversations
         SET data = data || $2::jsonb, updated_at = NOW()
         WHERE id = $1
         RETURNING data`,
        [id, JSON.stringify(updates)]
      );
      if (rows.length === 0) return null;
      await pgBumpRevision('conversations');
      return rows[0].data;
    }
    const data = getLocalData();
    const index = data.conversations.findIndex((c: any) => c.id === id);
    if (index !== -1) {
      data.conversations[index] = { ...data.conversations[index], ...updates };
      indexStore.conversationsById.set(id, data.conversations[index]);
      localBumpRevision('conversations');
      queueLocalWrite();
      return data.conversations[index];
    }
    return null;
  },

  deleteConversation: async (id: string): Promise<void> => {
    if (isPostgresMode()) {
      await ensurePgSchema();
      const pool = getPool();
      await pool.query(`DELETE FROM up_messages WHERE conversation_id = $1`, [id]);
      await pool.query(`DELETE FROM up_conversations WHERE id = $1`, [id]);
      await pgBumpRevision('conversations');
      return;
    }
    const data = getLocalData();
    data.conversations = data.conversations.filter((c: any) => c.id !== id);
    data.messages = data.messages.filter((m: any) => m.conversationId !== id);
    indexStore.conversationsById.delete(id);
    indexStore.messagesByConvId.delete(id);
    localBumpRevision('conversations');
    queueLocalWrite();
  },

  markConversationRead: async (convId: string, userEmail: string): Promise<void> => {
    const lower = userEmail.toLowerCase();
    if (isPostgresMode()) {
      const conv = await db.getConversationById(convId);
      if (!conv) return;
      const unreadFor: string[] = Array.isArray(conv.unreadFor) ? conv.unreadFor : [];
      const next = unreadFor.filter((e: string) => e.toLowerCase() !== lower);
      await getPool().query(
        `UPDATE up_conversations SET data = jsonb_set(data, '{unreadFor}', $2::jsonb, true) WHERE id = $1`,
        [convId, JSON.stringify(next)]
      );
      await pgBumpRevision('conversations');
      return;
    }
    const data = getLocalData();
    const index = data.conversations.findIndex((c: any) => c.id === convId);
    if (index !== -1) {
      const unreadFor: string[] = data.conversations[index].unreadFor || [];
      data.conversations[index] = {
        ...data.conversations[index],
        unreadFor: unreadFor.filter((e: string) => e.toLowerCase() !== lower)
      };
      indexStore.conversationsById.set(convId, data.conversations[index]);
      localBumpRevision('conversations');
      queueLocalWrite();
    }
  },

  addToUnreadFor: async (convId: string, userEmail: string): Promise<void> => {
    const lower = userEmail.toLowerCase();
    if (isPostgresMode()) {
      const conv = await db.getConversationById(convId);
      if (!conv) return;
      const unreadFor: string[] = Array.isArray(conv.unreadFor) ? conv.unreadFor : [];
      if (unreadFor.some((e: string) => e.toLowerCase() === lower)) return;
      const next = [...unreadFor, userEmail];
      await getPool().query(
        `UPDATE up_conversations SET data = jsonb_set(data, '{unreadFor}', $2::jsonb, true) WHERE id = $1`,
        [convId, JSON.stringify(next)]
      );
      await pgBumpRevision('conversations');
      return;
    }
    const data = getLocalData();
    const index = data.conversations.findIndex((c: any) => c.id === convId);
    if (index !== -1) {
      const unreadFor: string[] = data.conversations[index].unreadFor || [];
      if (!unreadFor.some((e: string) => e.toLowerCase() === lower)) {
        data.conversations[index] = {
          ...data.conversations[index],
          unreadFor: [...unreadFor, userEmail]
        };
        indexStore.conversationsById.set(convId, data.conversations[index]);
        localBumpRevision('conversations');
        queueLocalWrite();
      }
    }
  },

  // ── Messages ──────────────────────────────────────────────────────────────
  getMessagesByConversationId: async (conversationId: string): Promise<any[]> => {
    if (isPostgresMode()) {
      await ensurePgSchema();
      const { rows } = await getPool().query(
        `SELECT data FROM up_messages WHERE conversation_id = $1 ORDER BY seq ASC`,
        [conversationId]
      );
      return rows.map(r => r.data);
    }
    ensureLocalInit();
    return indexStore.messagesByConvId.get(conversationId) || [];
  },

  getMessagesGroupedByConversations: async (convIds: string[]): Promise<Map<string, any[]>> => {
    const map = new Map<string, any[]>();
    if (convIds.length === 0) return map;
    if (isPostgresMode()) {
      await ensurePgSchema();
      const { rows } = await getPool().query(
        `SELECT conversation_id, data FROM up_messages WHERE conversation_id = ANY($1::text[]) ORDER BY seq ASC`,
        [convIds]
      );
      for (const row of rows) {
        let list = map.get(row.conversation_id);
        if (!list) {
          list = [];
          map.set(row.conversation_id, list);
        }
        list.push(row.data);
      }
      return map;
    }
    ensureLocalInit();
    for (const id of convIds) {
      map.set(id, indexStore.messagesByConvId.get(id) || []);
    }
    return map;
  },

  insertMessage: async (message: any): Promise<any> => {
    if (isPostgresMode()) {
      await ensurePgSchema();
      await getPool().query(
        `INSERT INTO up_messages (id, conversation_id, data) VALUES ($1, $2, $3::jsonb)`,
        [message.id, message.conversationId, JSON.stringify(message)]
      );
      await pgBumpRevision('conversations');
      return message;
    }
    const data = getLocalData();
    data.messages.push(message);
    let list = indexStore.messagesByConvId.get(message.conversationId);
    if (!list) {
      list = [];
      indexStore.messagesByConvId.set(message.conversationId, list);
    }
    list.push(message);
    localBumpRevision('conversations');
    queueLocalWrite();
    return message;
  },

  // ── Following ─────────────────────────────────────────────────────────────
  getFollowing: async (userEmail: string): Promise<{ follower: string; target: string }[]> => {
    const lower = userEmail.toLowerCase();
    if (isPostgresMode()) {
      await ensurePgSchema();
      const { rows } = await getPool().query(
        `SELECT follower, target FROM up_following WHERE follower_lower = $1`,
        [lower]
      );
      return rows;
    }
    return getLocalData().following.filter((f: any) => f.follower && f.follower.toLowerCase() === lower);
  },

  insertFollowing: async (follower: string, targetEmail: string): Promise<void> => {
    const fLower = follower.toLowerCase();
    const tLower = targetEmail.toLowerCase();
    if (isPostgresMode()) {
      await ensurePgSchema();
      await getPool().query(
        `INSERT INTO up_following (follower_lower, target_lower, follower, target)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (follower_lower, target_lower) DO NOTHING`,
        [fLower, tLower, follower, targetEmail]
      );
      await pgBumpRevision('users');
      return;
    }
    const data = getLocalData();
    if (!data.following.some((f: any) => f.follower?.toLowerCase() === fLower && f.target?.toLowerCase() === tLower)) {
      data.following.push({ follower, target: targetEmail });
      localBumpRevision('users');
      queueLocalWrite();
    }
  },

  removeFollowing: async (follower: string, targetEmail: string): Promise<void> => {
    const fLower = follower.toLowerCase();
    const tLower = targetEmail.toLowerCase();
    if (isPostgresMode()) {
      await ensurePgSchema();
      await getPool().query(
        `DELETE FROM up_following WHERE follower_lower = $1 AND target_lower = $2`,
        [fLower, tLower]
      );
      await pgBumpRevision('users');
      return;
    }
    const data = getLocalData();
    data.following = data.following.filter(
      (f: any) => !(f.follower?.toLowerCase() === fLower && f.target?.toLowerCase() === tLower)
    );
    localBumpRevision('users');
    queueLocalWrite();
  },

  // ── Pets & Vaccination ───────────────────────────────────────────────────
  getPets: async (ownerEmail?: string): Promise<any[]> => {
    if (isPostgresMode()) {
      await ensurePgSchema();
      if (ownerEmail) {
        const { rows } = await getPool().query(
          `SELECT data FROM up_pets WHERE owner_email = $1 ORDER BY seq DESC`,
          [ownerEmail.toLowerCase()]
        );
        return rows.map(r => r.data);
      }
      const { rows } = await getPool().query(`SELECT data FROM up_pets ORDER BY seq DESC`);
      return rows.map(r => r.data);
    }
    ensureLocalInit();
    if (ownerEmail) {
      return indexStore.petsByOwner.get(ownerEmail.toLowerCase()) || [];
    }
    return getLocalData().pets || [];
  },

  getPetById: async (id: string): Promise<any | null> => {
    if (isPostgresMode()) {
      await ensurePgSchema();
      const { rows } = await getPool().query(
        `SELECT data FROM up_pets WHERE id = $1 LIMIT 1`,
        [id]
      );
      return rows[0]?.data || null;
    }
    ensureLocalInit();
    return indexStore.petsById.get(id) || null;
  },

  insertPet: async (pet: any): Promise<any> => {
    if (isPostgresMode()) {
      await ensurePgSchema();
      await getPool().query(
        `INSERT INTO up_pets (id, owner_email, data) VALUES ($1, $2, $3::jsonb)`,
        [pet.id, (pet.ownerEmail || '').toLowerCase(), JSON.stringify(pet)]
      );
      await pgBumpRevision('pets');
      return pet;
    }
    const data = getLocalData();
    if (!data.pets) data.pets = [];
    data.pets.unshift(pet);
    indexStore.petsById.set(pet.id, pet);
    if (pet.ownerEmail) {
      const owner = pet.ownerEmail.toLowerCase();
      let list = indexStore.petsByOwner.get(owner);
      if (!list) {
        list = [];
        indexStore.petsByOwner.set(owner, list);
      }
      list.unshift(pet);
    }
    localBumpRevision('pets');
    queueLocalWrite();
    return pet;
  },

  updatePet: async (id: string, updates: any): Promise<any | null> => {
    if (isPostgresMode()) {
      await ensurePgSchema();
      const { rows } = await getPool().query(
        `UPDATE up_pets SET data = data || $2::jsonb WHERE id = $1 RETURNING data`,
        [id, JSON.stringify(updates)]
      );
      if (rows.length === 0) return null;
      await pgBumpRevision('pets');
      return rows[0].data;
    }
    const data = getLocalData();
    if (!data.pets) data.pets = [];
    const index = data.pets.findIndex((p: any) => p.id === id);
    if (index !== -1) {
      data.pets[index] = { ...data.pets[index], ...updates };
      indexStore.petsById.set(id, data.pets[index]);
      const owner = (data.pets[index].ownerEmail || '').toLowerCase();
      const list = indexStore.petsByOwner.get(owner);
      if (list) {
        const pIdx = list.findIndex((p: any) => p.id === id);
        if (pIdx !== -1) list[pIdx] = data.pets[index];
      }
      localBumpRevision('pets');
      queueLocalWrite();
      return data.pets[index];
    }
    return null;
  },

  deletePet: async (id: string): Promise<void> => {
    if (isPostgresMode()) {
      await ensurePgSchema();
      await getPool().query(`DELETE FROM up_pets WHERE id = $1`, [id]);
      await pgBumpRevision('pets');
      return;
    }
    const data = getLocalData();
    if (!data.pets) data.pets = [];
    const pet = indexStore.petsById.get(id);
    data.pets = data.pets.filter((p: any) => p.id !== id);
    indexStore.petsById.delete(id);
    if (pet?.ownerEmail) {
      const owner = pet.ownerEmail.toLowerCase();
      const list = indexStore.petsByOwner.get(owner);
      if (list) {
        indexStore.petsByOwner.set(owner, list.filter((p: any) => p.id !== id));
      }
    }
    localBumpRevision('pets');
    queueLocalWrite();
  },

  addVaccine: async (petId: string, vaccine: any): Promise<any | null> => {
    const pet = await db.getPetById(petId);
    if (!pet) return null;
    const vaccines = Array.isArray(pet.vaccines) ? [...pet.vaccines, vaccine] : [vaccine];
    await db.updatePet(petId, { vaccines });
    return vaccine;
  },

  updateVaccine: async (petId: string, vaccineId: string, updates: any): Promise<any | null> => {
    const pet = await db.getPetById(petId);
    if (!pet || !Array.isArray(pet.vaccines)) return null;
    const vIndex = pet.vaccines.findIndex((v: any) => v.id === vaccineId);
    if (vIndex === -1) return null;
    const vaccines = [...pet.vaccines];
    vaccines[vIndex] = { ...vaccines[vIndex], ...updates };
    await db.updatePet(petId, { vaccines });
    return vaccines[vIndex];
  },

  deleteVaccine: async (petId: string, vaccineId: string): Promise<boolean> => {
    const pet = await db.getPetById(petId);
    if (!pet || !Array.isArray(pet.vaccines)) return false;
    const vaccines = pet.vaccines.filter((v: any) => v.id !== vaccineId);
    await db.updatePet(petId, { vaccines });
    return true;
  },

  // ── Pet Medications ──────────────────────────────────────────────────────
  addMedication: async (petId: string, medication: any): Promise<any | null> => {
    const pet = await db.getPetById(petId);
    if (!pet) return null;
    const newMed = {
      ...medication,
      takenDates: Array.isArray(medication.takenDates) ? medication.takenDates : []
    };
    const medications = Array.isArray(pet.medications) ? [...pet.medications, newMed] : [newMed];
    await db.updatePet(petId, { medications });
    return newMed;
  },

  updateMedication: async (petId: string, medId: string, updates: any): Promise<any | null> => {
    const pet = await db.getPetById(petId);
    if (!pet || !Array.isArray(pet.medications)) return null;
    const mIndex = pet.medications.findIndex((m: any) => m.id === medId);
    if (mIndex === -1) return null;
    const medications = [...pet.medications];
    medications[mIndex] = { ...medications[mIndex], ...updates };
    await db.updatePet(petId, { medications });
    return medications[mIndex];
  },

  deleteMedication: async (petId: string, medId: string): Promise<boolean> => {
    const pet = await db.getPetById(petId);
    if (!pet || !Array.isArray(pet.medications)) return false;
    const medications = pet.medications.filter((m: any) => m.id !== medId);
    await db.updatePet(petId, { medications });
    return true;
  },

  toggleMedicationTaken: async (petId: string, medId: string, dateStr: string): Promise<any | null> => {
    const pet = await db.getPetById(petId);
    if (!pet || !Array.isArray(pet.medications)) return null;
    const mIndex = pet.medications.findIndex((m: any) => m.id === medId);
    if (mIndex === -1) return null;

    const medications = [...pet.medications];
    const med = { ...medications[mIndex] };
    const takenDates: string[] = Array.isArray(med.takenDates) ? [...med.takenDates] : [];
    const idx = takenDates.indexOf(dateStr);
    if (idx !== -1) {
      takenDates.splice(idx, 1);
      if (med.lastTakenDate === dateStr) {
        med.lastTakenDate = takenDates[takenDates.length - 1] || undefined;
      }
    } else {
      takenDates.push(dateStr);
      med.lastTakenDate = dateStr;
    }
    med.takenDates = takenDates;
    medications[mIndex] = med;
    await db.updatePet(petId, { medications });
    return med;
  },

  // ── Pet Weight History ───────────────────────────────────────────────────
  addWeightRecord: async (petId: string, record: any): Promise<any | null> => {
    const pet = await db.getPetById(petId);
    if (!pet) return null;
    const weightHistory = Array.isArray(pet.weightHistory) ? [record, ...pet.weightHistory] : [record];
    await db.updatePet(petId, {
      weightHistory,
      weight: `${record.weightKg} kg`
    });
    return record;
  },

  deleteWeightRecord: async (petId: string, recordId: string): Promise<boolean> => {
    const pet = await db.getPetById(petId);
    if (!pet || !Array.isArray(pet.weightHistory)) return false;
    const weightHistory = pet.weightHistory.filter((w: any) => w.id !== recordId);
    await db.updatePet(petId, { weightHistory });
    return true;
  },

  // ── Saved Posts (Bookmarks) ──────────────────────────────────────────────
  getSavedPosts: async (userEmail: string): Promise<string[]> => {
    const user = await db.getUserByEmail(userEmail);
    return Array.isArray(user?.savedPosts) ? user.savedPosts : [];
  },

  toggleSavedPost: async (userEmail: string, postId: string): Promise<string[]> => {
    const user = await db.getUserByEmail(userEmail);
    if (!user) return [];
    const savedPosts: string[] = Array.isArray(user.savedPosts) ? [...user.savedPosts] : [];
    const idx = savedPosts.indexOf(postId);
    if (idx !== -1) {
      savedPosts.splice(idx, 1);
    } else {
      savedPosts.push(postId);
    }
    await db.updateUser(userEmail, { savedPosts });
    return savedPosts;
  },

  // ── Emergency Vet Contact ────────────────────────────────────────────────
  getEmergencyVet: async (userEmail: string): Promise<any | null> => {
    const user = await db.getUserByEmail(userEmail);
    return user?.emergencyVet || null;
  },

  updateEmergencyVet: async (userEmail: string, contact: any): Promise<any | null> => {
    const updated = await db.updateUser(userEmail, { emergencyVet: contact });
    return updated ? contact : null;
  }
};
