/// <reference types="vite/client" />
import { Post, Comment, Conversation, Message, UserProfile, PetRecord, VaccineRecord, PetMedication, PetWeightRecord, EmergencyVetContact, PublicPetRescueProfile, AiTriageResponse, AiMatchResult } from '../types';

const baseUrl = ((import.meta as any).env?.BASE_URL || '/').replace(/\/$/, '');
export const API_BASE =
  (import.meta as any).env?.VITE_API_URL ||
  ((import.meta as any).env?.DEV ? '/api' : `${baseUrl}/api`);

/** In-memory client cache with ETag tracking */
const clientCache = {
  posts: null as Post[] | null,
  postsEtag: '' as string | null,
  conversations: new Map<string, { data: Conversation[]; etag: string | null }>(),
  pets: new Map<string, PetRecord[]>()
};

export function clearClientCache() {
  clientCache.posts = null;
  clientCache.postsEtag = null;
  clientCache.conversations.clear();
  clientCache.pets.clear();
}

/** Returns common headers including user identity and signed token for the backend. */
function authHeaders(userEmail?: string): HeadersInit {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (userEmail) {
    headers['x-user-email'] = userEmail;
  }
  try {
    const token = typeof window !== 'undefined' ? localStorage.getItem('uniao_pet_token') : null;
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
  } catch {}
  return headers;
}

// ── Health & Sync ─────────────────────────────────────────────────────────────
export async function checkHealth(): Promise<{ status: string; time: string }> {
  const res = await fetch(`${API_BASE}/health`);
  if (!res.ok) throw new Error('Health check failed');
  return res.json();
}

export async function checkSyncStatus(): Promise<{
  posts: number;
  conversations: number;
  pets: number;
  users: number;
  global: number;
}> {
  const res = await fetch(`${API_BASE}/sync/status`);
  if (!res.ok) throw new Error('Sync check failed');
  return res.json();
}

// ── Auth ─────────────────────────────────────────────────────────────────────
export async function login(
  email: string,
  pass: string
): Promise<{ user: UserProfile; token: string }> {
  const res = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: pass })
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Login failed');
  clearClientCache();
  return data;
}

export async function register(
  name: string,
  email: string,
  pass: string,
  avatar?: string
): Promise<{ user: UserProfile; token: string }> {
  const res = await fetch(`${API_BASE}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, email, password: pass, avatar })
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Registration failed');
  clearClientCache();
  return data;
}

export async function updateProfile(
  email: string,
  updates: { name?: string; avatar?: string; phone?: string; bio?: string }
): Promise<UserProfile> {
  const res = await fetch(`${API_BASE}/users/me`, {
    method: 'PATCH',
    headers: authHeaders(email),
    body: JSON.stringify({ email, ...updates })
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Update failed');
  return data;
}

// ── Posts ─────────────────────────────────────────────────────────────────────
/** Fetch all posts with conditional ETag 304 caching */
export async function fetchPosts(userEmail?: string, forceRefresh = false): Promise<Post[]> {
  const url = userEmail
    ? `${API_BASE}/posts?userEmail=${encodeURIComponent(userEmail)}`
    : `${API_BASE}/posts`;

  const headers: Record<string, string> = {};
  if (!forceRefresh && clientCache.postsEtag && clientCache.posts) {
    headers['If-None-Match'] = clientCache.postsEtag;
  }

  const res = await fetch(url, { headers });

  if (res.status === 304 && clientCache.posts) {
    return clientCache.posts;
  }

  if (!res.ok) throw new Error('Failed to fetch posts');

  const newEtag = res.headers.get('ETag');
  const data: Post[] = await res.json();
  clientCache.posts = data;
  if (newEtag) clientCache.postsEtag = newEtag;

  return data;
}

export async function createPost(
  post: Omit<Post, 'id' | 'comments' | 'likedByMe'>,
  userEmail?: string
): Promise<Post> {
  const res = await fetch(`${API_BASE}/posts`, {
    method: 'POST',
    headers: authHeaders(userEmail),
    body: JSON.stringify({ ...post, authorEmail: userEmail })
  });
  if (!res.ok) throw new Error('Failed to create post');
  const created = await res.json();
  // Invalidate posts cache
  clientCache.postsEtag = null;
  return created;
}

export async function toggleLike(postId: string, userEmail: string): Promise<Post> {
  const res = await fetch(`${API_BASE}/posts/${postId}/like`, {
    method: 'PATCH',
    headers: authHeaders(userEmail),
    body: JSON.stringify({ userEmail })
  });
  if (!res.ok) throw new Error('Failed to toggle like');
  const updated = await res.json();
  clientCache.postsEtag = null;
  return updated;
}

export async function addComment(
  postId: string,
  comment: Omit<Comment, 'id'>,
  userEmail?: string
): Promise<Comment> {
  const res = await fetch(`${API_BASE}/posts/${postId}/comments`, {
    method: 'POST',
    headers: authHeaders(userEmail),
    body: JSON.stringify(comment)
  });
  if (!res.ok) throw new Error('Failed to add comment');
  const created = await res.json();
  clientCache.postsEtag = null;
  return created;
}

export async function deletePost(postId: string, userEmail?: string): Promise<void> {
  const res = await fetch(`${API_BASE}/posts/${postId}`, {
    method: 'DELETE',
    headers: authHeaders(userEmail)
  });
  if (!res.ok) throw new Error('Failed to delete post');
  clientCache.postsEtag = null;
}

export async function updatePostStatus(postId: string, status?: 'ativo' | 'resolvido', userEmail?: string): Promise<Post> {
  const res = await fetch(`${API_BASE}/posts/${postId}/status`, {
    method: 'PATCH',
    headers: authHeaders(userEmail),
    body: JSON.stringify({ status })
  });
  if (!res.ok) throw new Error('Failed to update post status');
  const updated = await res.json();
  clientCache.postsEtag = null;
  return updated;
}

// ── Conversations ─────────────────────────────────────────────────────────────
/** Fetch conversations with conditional 304 ETag caching */
export async function fetchConversations(userEmail: string, forceRefresh = false): Promise<Conversation[]> {
  const cached = clientCache.conversations.get(userEmail.toLowerCase());
  const headers: Record<string, string> = {};

  if (!forceRefresh && cached && cached.etag) {
    headers['If-None-Match'] = cached.etag;
  }

  const res = await fetch(
    `${API_BASE}/conversations?userEmail=${encodeURIComponent(userEmail)}`,
    { headers }
  );

  if (res.status === 304 && cached) {
    return cached.data;
  }

  if (!res.ok) throw new Error('Failed to fetch conversations');

  const newEtag = res.headers.get('ETag');
  const data: Conversation[] = await res.json();
  clientCache.conversations.set(userEmail.toLowerCase(), {
    data,
    etag: newEtag
  });

  return data;
}

export async function createConversation(
  conv: Omit<Conversation, 'id' | 'messages'>
): Promise<Conversation> {
  const res = await fetch(`${API_BASE}/conversations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(conv)
  });
  if (!res.ok) throw new Error('Failed to create conversation');
  clientCache.conversations.clear();
  return res.json();
}

export async function addMessage(
  conversationId: string,
  msg: Omit<Message, 'id' | 'sender'>
): Promise<Message> {
  const res = await fetch(`${API_BASE}/conversations/${conversationId}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(msg)
  });
  if (!res.ok) throw new Error('Failed to add message');
  clientCache.conversations.clear();
  return res.json();
}

export async function markConversationAsRead(conversationId: string, userEmail: string): Promise<void> {
  await fetch(`${API_BASE}/conversations/${conversationId}/read`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userEmail })
  });
  clientCache.conversations.clear();
}

export async function deleteConversation(conversationId: string, userEmail: string): Promise<void> {
  const res = await fetch(`${API_BASE}/conversations/${conversationId}`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userEmail })
  });
  if (!res.ok) throw new Error('Failed to delete conversation');
  clientCache.conversations.clear();
}

// ── Users ─────────────────────────────────────────────────────────────────────
export async function fetchUsers(query?: string): Promise<UserProfile[]> {
  const url = query
    ? `${API_BASE}/users?q=${encodeURIComponent(query)}`
    : `${API_BASE}/users`;
  const res = await fetch(url);
  if (!res.ok) throw new Error('Failed to fetch users');
  return res.json();
}

export async function getFollowing(
  userEmail: string
): Promise<{ follower: string; target: string }[]> {
  const res = await fetch(
    `${API_BASE}/following?userEmail=${encodeURIComponent(userEmail)}`
  );
  if (!res.ok) throw new Error('Failed to fetch following');
  return res.json();
}

export async function toggleFollow(
  userEmail: string,
  targetEmail: string,
  isFollowing: boolean
): Promise<void> {
  const method = isFollowing ? 'POST' : 'DELETE';
  const res = await fetch(
    `${API_BASE}/users/${encodeURIComponent(targetEmail)}/follow`,
    {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userEmail })
    }
  );
  if (!res.ok) throw new Error('Failed to toggle follow');
}

// ── Pets & Caderneta de Vacinação ──────────────────────────────────────────────
export async function fetchPets(userEmail: string, forceRefresh = false): Promise<PetRecord[]> {
  const cached = clientCache.pets.get(userEmail.toLowerCase());
  if (!forceRefresh && cached) {
    // Return cached pets immediately, refresh in background
    fetch(`${API_BASE}/pets?userEmail=${encodeURIComponent(userEmail)}`, {
      headers: authHeaders(userEmail)
    }).then(async r => {
      if (r.ok) {
        const data = await r.json();
        clientCache.pets.set(userEmail.toLowerCase(), data);
      }
    }).catch(() => {});
    return cached;
  }

  const res = await fetch(`${API_BASE}/pets?userEmail=${encodeURIComponent(userEmail)}`, {
    headers: authHeaders(userEmail)
  });
  if (!res.ok) throw new Error('Failed to fetch pets');
  const data = await res.json();
  clientCache.pets.set(userEmail.toLowerCase(), data);
  return data;
}

export async function createPet(
  pet: Omit<PetRecord, 'id' | 'vaccines' | 'createdAt' | 'ownerEmail'>,
  userEmail: string
): Promise<PetRecord> {
  const res = await fetch(`${API_BASE}/pets`, {
    method: 'POST',
    headers: authHeaders(userEmail),
    body: JSON.stringify({ ...pet, ownerEmail: userEmail })
  });
  if (!res.ok) throw new Error('Failed to create pet');
  clientCache.pets.delete(userEmail.toLowerCase());
  return res.json();
}

export async function updatePet(
  petId: string,
  updates: Partial<PetRecord>,
  userEmail?: string
): Promise<PetRecord> {
  const res = await fetch(`${API_BASE}/pets/${petId}`, {
    method: 'PATCH',
    headers: authHeaders(userEmail),
    body: JSON.stringify(updates)
  });
  if (!res.ok) throw new Error('Failed to update pet');
  if (userEmail) clientCache.pets.delete(userEmail.toLowerCase());
  return res.json();
}

export async function deletePet(petId: string, userEmail?: string): Promise<void> {
  const res = await fetch(`${API_BASE}/pets/${petId}`, {
    method: 'DELETE',
    headers: authHeaders(userEmail)
  });
  if (!res.ok) throw new Error('Failed to delete pet');
  if (userEmail) clientCache.pets.delete(userEmail.toLowerCase());
}

export async function addVaccine(
  petId: string,
  vaccine: Omit<VaccineRecord, 'id'>,
  userEmail?: string
): Promise<VaccineRecord> {
  const res = await fetch(`${API_BASE}/pets/${petId}/vaccines`, {
    method: 'POST',
    headers: authHeaders(userEmail),
    body: JSON.stringify(vaccine)
  });
  if (!res.ok) throw new Error('Failed to add vaccine');
  if (userEmail) clientCache.pets.delete(userEmail.toLowerCase());
  return res.json();
}

export async function updateVaccine(
  petId: string,
  vaccineId: string,
  updates: Partial<VaccineRecord>,
  userEmail?: string
): Promise<VaccineRecord> {
  const res = await fetch(`${API_BASE}/pets/${petId}/vaccines/${vaccineId}`, {
    method: 'PATCH',
    headers: authHeaders(userEmail),
    body: JSON.stringify(updates)
  });
  if (!res.ok) throw new Error('Failed to update vaccine');
  if (userEmail) clientCache.pets.delete(userEmail.toLowerCase());
  return res.json();
}

export async function deleteVaccine(
  petId: string,
  vaccineId: string,
  userEmail?: string
): Promise<void> {
  const res = await fetch(`${API_BASE}/pets/${petId}/vaccines/${vaccineId}`, {
    method: 'DELETE',
    headers: authHeaders(userEmail)
  });
  if (!res.ok) throw new Error('Failed to delete vaccine');
  if (userEmail) clientCache.pets.delete(userEmail.toLowerCase());
}

// ── Database Safety & Backup ────────────────────────────────────────────────
export function getBackupDownloadUrl(): string {
  return `${API_BASE}/admin/backup/download`;
}

export async function downloadBackup(): Promise<void> {
  const res = await fetch(`${API_BASE}/admin/backup/download`, {
    headers: authHeaders()
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || 'Falha ao baixar backup');
  }
  const blob = await res.blob();
  const dateStr = new Date().toISOString().split('T')[0];
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `uniao_pet_backup_${dateStr}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export async function getDatabaseStats(): Promise<{
  dbPath: string;
  dataDir: string;
  backupsDir: string;
  usersCount: number;
  postsCount: number;
  petsCount: number;
  conversationsCount: number;
  messagesCount: number;
  backupsCount: number;
}> {
  const res = await fetch(`${API_BASE}/admin/backup/stats`, {
    headers: authHeaders()
  });
  if (!res.ok) throw new Error('Failed to fetch DB stats');
  return res.json();
}

export async function listDatabaseBackups(): Promise<{
  backups: Array<{
    filename: string;
    sizeBytes: number;
    createdAt: string;
    updatedAt: string;
  }>;
}> {
  const res = await fetch(`${API_BASE}/admin/backups`, {
    headers: authHeaders()
  });
  if (!res.ok) throw new Error('Failed to list backups');
  return res.json();
}

export async function createManualBackup(): Promise<{ message: string; file: string }> {
  const res = await fetch(`${API_BASE}/admin/backup/create`, {
    method: 'POST',
    headers: authHeaders()
  });
  if (!res.ok) throw new Error('Failed to create manual backup');
  return res.json();
}

export async function restoreDatabase(jsonData: any): Promise<{ message: string }> {
  const res = await fetch(`${API_BASE}/admin/backup/restore`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(jsonData)
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to restore backup');
  clearClientCache();
  return data;
}

// ── Medications ─────────────────────────────────────────────────────────────
export async function addMedication(
  petId: string,
  medication: Omit<PetMedication, 'id' | 'petId' | 'active' | 'takenDates' | 'createdAt'>,
  userEmail?: string
): Promise<PetMedication> {
  const res = await fetch(`${API_BASE}/pets/${petId}/medications`, {
    method: 'POST',
    headers: authHeaders(userEmail),
    body: JSON.stringify(medication)
  });
  if (!res.ok) throw new Error('Failed to add medication');
  if (userEmail) clientCache.pets.delete(userEmail.toLowerCase());
  return res.json();
}

export async function updateMedication(
  petId: string,
  medId: string,
  updates: Partial<PetMedication>,
  userEmail?: string
): Promise<PetMedication> {
  const res = await fetch(`${API_BASE}/pets/${petId}/medications/${medId}`, {
    method: 'PATCH',
    headers: authHeaders(userEmail),
    body: JSON.stringify(updates)
  });
  if (!res.ok) throw new Error('Failed to update medication');
  if (userEmail) clientCache.pets.delete(userEmail.toLowerCase());
  return res.json();
}

export async function deleteMedication(
  petId: string,
  medId: string,
  userEmail?: string
): Promise<void> {
  const res = await fetch(`${API_BASE}/pets/${petId}/medications/${medId}`, {
    method: 'DELETE',
    headers: authHeaders(userEmail)
  });
  if (!res.ok) throw new Error('Failed to delete medication');
  if (userEmail) clientCache.pets.delete(userEmail.toLowerCase());
}

export async function toggleMedicationTaken(
  petId: string,
  medId: string,
  dateStr?: string,
  userEmail?: string
): Promise<PetMedication> {
  const res = await fetch(`${API_BASE}/pets/${petId}/medications/${medId}/toggle-taken`, {
    method: 'POST',
    headers: authHeaders(userEmail),
    body: JSON.stringify({ date: dateStr })
  });
  if (!res.ok) throw new Error('Failed to toggle medication taken');
  if (userEmail) clientCache.pets.delete(userEmail.toLowerCase());
  return res.json();
}

// ── Weight History ──────────────────────────────────────────────────────────
export async function addWeightRecord(
  petId: string,
  weightOrData: number | { weightKg: number; date?: string; notes?: string },
  dateOrUserEmail?: string,
  notes?: string,
  userEmail?: string
): Promise<PetWeightRecord> {
  const payload = typeof weightOrData === 'number'
    ? { weightKg: weightOrData, date: dateOrUserEmail, notes }
    : weightOrData;
  const email = typeof weightOrData === 'number' ? userEmail : dateOrUserEmail;

  const res = await fetch(`${API_BASE}/pets/${petId}/weight`, {
    method: 'POST',
    headers: authHeaders(email),
    body: JSON.stringify(payload)
  });
  if (!res.ok) throw new Error('Failed to add weight record');
  if (email) clientCache.pets.delete(email.toLowerCase());
  return res.json();
}

export async function deleteWeightRecord(
  petId: string,
  weightId: string,
  userEmail?: string
): Promise<void> {
  const res = await fetch(`${API_BASE}/pets/${petId}/weight/${weightId}`, {
    method: 'DELETE',
    headers: authHeaders(userEmail)
  });
  if (!res.ok) throw new Error('Failed to delete weight record');
  if (userEmail) clientCache.pets.delete(userEmail.toLowerCase());
}

// ── Saved Posts ─────────────────────────────────────────────────────────────
export async function fetchSavedPosts(userEmail: string): Promise<string[]> {
  const res = await fetch(`${API_BASE}/users/me/saved-posts`, {
    headers: authHeaders(userEmail)
  });
  if (!res.ok) throw new Error('Failed to fetch saved posts');
  const data = await res.json();
  return data.savedPosts || [];
}

export async function toggleSavedPost(postId: string, userEmail: string): Promise<string[]> {
  const res = await fetch(`${API_BASE}/users/me/saved-posts/${postId}`, {
    method: 'POST',
    headers: authHeaders(userEmail)
  });
  if (!res.ok) throw new Error('Failed to toggle saved post');
  const data = await res.json();
  return data.savedPosts || [];
}

// ── Emergency Vet Contact ───────────────────────────────────────────────────
export async function fetchEmergencyVet(userEmail: string): Promise<EmergencyVetContact | null> {
  const res = await fetch(`${API_BASE}/users/me/emergency-vet`, {
    headers: authHeaders(userEmail)
  });
  if (!res.ok) throw new Error('Failed to fetch emergency vet');
  const data = await res.json();
  return data.contact;
}

export async function updateEmergencyVet(
  contact: EmergencyVetContact,
  userEmail: string
): Promise<EmergencyVetContact> {
  const res = await fetch(`${API_BASE}/users/me/emergency-vet`, {
    method: 'PUT',
    headers: authHeaders(userEmail),
    body: JSON.stringify(contact)
  });
  if (!res.ok) throw new Error('Failed to update emergency vet');
  const data = await res.json();
  return data.contact;
}

// ── Public Pet Rescue Profile (QR Code Collar) ──────────────────────────────
export async function fetchPublicPetProfile(petId: string): Promise<PublicPetRescueProfile> {
  const res = await fetch(`${API_BASE}/public/pet/${encodeURIComponent(petId)}`);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Pet não encontrado');
  return data;
}

// ── AI Gemini & Smart Veterinary Tools ──────────────────────────────────────
export async function scanVaccineLabelWithAi(
  imageBase64: string,
  petSpecies?: string
): Promise<{
  name: string;
  type: 'vacina' | 'vermifugo' | 'consulta';
  dateApplied: string;
  nextDueDate?: string;
  veterinarian?: string;
  clinic?: string;
  batch?: string;
  notes?: string;
  source?: string;
}> {
  const res = await fetch(`${API_BASE}/ai/scan-vaccine`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ imageBase64, petSpecies })
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Não foi possível analisar a imagem.');
  return data;
}

export async function runEmergencyAiTriage(payload: {
  query: string;
  petSpecies?: string;
  weightKg?: number;
}): Promise<AiTriageResponse> {
  const res = await fetch(`${API_BASE}/ai/triage`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(payload)
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Falha na triagem.');
  return data;
}

export async function findSmartPostMatches(postId: string): Promise<{ matches: AiMatchResult[] }> {
  const res = await fetch(`${API_BASE}/ai/match-posts`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ postId })
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Falha ao buscar correspondências.');
  return data;
}
