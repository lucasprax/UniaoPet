export type PostCategory = 'desaparecido' | 'adoção' | 'adocao' | 'doação' | 'doacao';

export interface Comment {
  id: string;
  authorName: string;
  authorAvatar: string;
  text: string;
  date: string;
  createdAt?: string;
}

export interface Post {
  id: string;
  authorName: string;
  authorEmail?: string;
  authorAvatar: string;
  date: string;
  createdAt?: string;
  category: PostCategory;
  title: string;
  petName: string;
  description: string;
  location: string;
  phone: string;
  likes: number;
  likedByMe: boolean;
  likedBy?: string[]; // array of user emails — source of truth for per-user likes
  comments: Comment[];
  imageUrl: string;
  status?: 'ativo' | 'resolvido';
  species?: PetSpecies;
  lat?: number;
  lng?: number;
  reward?: string;
  lastSeenDate?: string;
}

export interface Message {
  id: string;
  sender: 'me' | 'other'; // resolved client-side based on senderEmail
  senderEmail?: string;    // persisted in DB — actual sender identity
  senderName?: string;
  text: string;
  timestamp: string;
  imageUrl?: string;
  sharedPost?: Post;
}

export interface Conversation {
  id: string;
  title: string;
  category: PostCategory | 'geral';
  lastMessage: string;
  date: string;
  messages: Message[];
  participants?: string[];   // array of participant emails
  recipient?: UserProfile;
  recipientEmail?: string;   // persisted recipient email
  recipientName?: string;
  recipientAvatar?: string;
  hasUnread?: boolean;       // true when this user has unread messages
  unreadFor?: string[];
  createdAt?: string;
}

export interface UserProfile {
  id?: string;
  name: string;
  email: string;
  avatar?: string;
  phone?: string;
  bio?: string;
  savedPosts?: string[];
  emergencyVet?: EmergencyVetContact;
  lastSeen?: number | string;
}

export type VaccineType = 'vacina' | 'vermifugo' | 'antipulgas' | 'consulta';
export type VaccineStatus = 'em_dia' | 'proximo' | 'atrasado';

export interface VaccineRecord {
  id: string;
  name: string;
  type: VaccineType;
  dateApplied: string;
  nextDueDate?: string;
  veterinarian?: string;
  clinic?: string;
  batch?: string;
  notes?: string;
  status?: VaccineStatus;
}

export type PetSpecies = 'dog' | 'cat' | 'bird' | 'other';

export interface PetMedication {
  id: string;
  petId: string;
  name: string;
  dosage: string;
  frequency: string;
  startDate: string;
  endDate?: string;
  notes?: string;
  active: boolean;
  takenDates: string[];
  lastTakenDate?: string;
  createdAt: string;
}

export interface PetWeightRecord {
  id: string;
  petId: string;
  date: string;
  weightKg: number;
  notes?: string;
}

export interface EmergencyVetContact {
  name: string;
  phone: string;
  address: string;
  city?: string;
  notes?: string;
  is24Hours?: boolean;
}

export interface PetRecord {
  id: string;
  ownerEmail: string;
  name: string;
  species: PetSpecies;
  breed: string;
  birthDate?: string;
  gender: 'macho' | 'femea';
  weight?: string;
  avatar?: string;
  microchip?: string;
  notes?: string;
  allergies?: string;
  neutered?: boolean;
  bloodType?: string;
  vaccines: VaccineRecord[];
  medications?: PetMedication[];
  weightHistory?: PetWeightRecord[];
  createdAt: string;
}

export interface PublicPetRescueProfile {
  pet: PetRecord;
  owner: {
    name: string;
    email: string;
    phone?: string;
    avatar?: string;
    emergencyVet?: EmergencyVetContact | null;
  };
}

export interface AiTriageResponse {
  urgencyLevel: 'critica' | 'alta' | 'moderada' | 'baixa';
  title: string;
  summary: string;
  immediateSteps: string[];
  warnings: string[];
  vetRecommendation: string;
  source: 'gemini' | 'clinical-engine';
}

export interface AiMatchResult {
  post: Post;
  score: number;
  reasons: string[];
}


