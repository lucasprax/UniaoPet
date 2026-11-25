import React, { useState, useMemo, useEffect } from 'react';
import { Post, Comment, PostCategory, UserProfile, PetSpecies, AiMatchResult } from '../types';
import {
  Heart,
  MessageSquare,
  MapPin,
  Phone,
  Plus,
  Search,
  X,
  Image as ImageIcon,
  Send,
  Share2,
  CheckCircle2,
  Trash2,
  Bookmark,
  FileText,
  Sparkles,
  Map as MapIcon,
  LayoutList,
  Navigation,
  ExternalLink
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import * as api from '../lib/apiService';
import { formatRelativeTime } from '../lib/dateUtils';
import {
  getPostDeepLink,
  resolvePostCoordinates,
  calculateDistanceKm
} from '../lib/petUtils';
import toast from 'react-hot-toast';
import FlyerModal from './FlyerModal';
import { compressImageFile } from '../lib/imageCompressor';

/** Infer species from text keywords for legacy posts */
function inferSpecies(post: Post): PetSpecies {
  if (post.species) return post.species;
  const text = `${post.title} ${post.description} ${post.petName}`.toLowerCase();
  if (
    text.includes('calopsita') ||
    text.includes('ave') ||
    text.includes('pássaro') ||
    text.includes('passaro') ||
    text.includes('papagaio') ||
    text.includes('periquito') ||
    text.includes('canário') ||
    text.includes('canario') ||
    text.includes('arara') ||
    text.includes('esvoaçante') ||
    text.includes('voando')
  ) {
    return 'bird';
  }
  if (
    text.includes('gat') ||
    text.includes('cat') ||
    text.includes('felin') ||
    text.includes('bichano') ||
    text.includes('gatinh')
  ) {
    return 'cat';
  }
  if (
    text.includes('cachorr') ||
    text.includes('cão') ||
    text.includes('cao') ||
    text.includes('dog') ||
    text.includes('pinscher') ||
    text.includes('pitbull') ||
    text.includes('poodle') ||
    text.includes('pastor') ||
    text.includes('filhote') ||
    text.includes('vira-lata')
  ) {
    return 'dog';
  }
  return 'other';
}

interface FeedTabProps {
  posts: Post[];
  setPosts: React.Dispatch<React.SetStateAction<Post[]>>;
  onStartChat: (post: Post) => void;
  currentUser: UserProfile | null;
  onRequireAuth?: () => void;
}

export default function FeedTab({
  posts,
  setPosts,
  onStartChat,
  currentUser,
  onRequireAuth
}: FeedTabProps) {
  const [viewMode, setViewMode] = useState<'list' | 'map'>('list');
  const [activeFilter, setActiveFilter] = useState<PostCategory | 'todos'>('todos');
  const [statusView, setStatusView] = useState<'todos' | 'ativos' | 'resolvidos'>('todos');
  const [speciesFilter, setSpeciesFilter] = useState<'todos' | PetSpecies>('todos');
  const [onlySaved, setOnlySaved] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [savedPostIds, setSavedPostIds] = useState<string[]>([]);
  const [selectedPostForFlyer, setSelectedPostForFlyer] = useState<Post | null>(null);
  const [highlightedPostId, setHighlightedPostId] = useState<string | null>(null);

  // Geolocation & Radar Map State
  const [userGps, setUserGps] = useState<{ lat: number; lng: number } | null>(null);
  const [maxDistanceKm, setMaxDistanceKm] = useState<number | null>(null);
  const [selectedMapPost, setSelectedMapPost] = useState<Post | null>(null);
  const [gettingGps, setGettingGps] = useState(false);

  // AI Smart Match State
  const [matchingPostId, setMatchingPostId] = useState<string | null>(null);
  const [matchesByPostId, setMatchesByPostId] = useState<Record<string, AiMatchResult[]>>({});

  // Create Post Modal State
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isSubmittingPost, setIsSubmittingPost] = useState(false);
  const [newPostCategory, setNewPostCategory] = useState<PostCategory>('desaparecido');
  const [newPostSpecies, setNewPostSpecies] = useState<PetSpecies>('dog');
  const [newPostTitle, setNewPostTitle] = useState('');
  const [newPostPetName, setNewPostPetName] = useState('');
  const [newPostDescription, setNewPostDescription] = useState('');
  const [newPostLocation, setNewPostLocation] = useState('');
  const [newPostPhone, setNewPostPhone] = useState('');
  const [newPostImage, setNewPostImage] = useState('');
  const [newPostCoords, setNewPostCoords] = useState<{ lat: number; lng: number } | null>(null);

  // Comment Modal State
  const [selectedPostForComments, setSelectedPostForComments] = useState<Post | null>(null);
  const [newCommentText, setNewCommentText] = useState('');

  // Load saved posts on mount
  useEffect(() => {
    if (currentUser?.email) {
      api.fetchSavedPosts(currentUser.email).then(setSavedPostIds).catch(() => {});
    } else {
      setSavedPostIds([]);
    }
  }, [currentUser?.email]);

  // Deep link scroll & highlight (#post-123)
  useEffect(() => {
    const checkHash = () => {
      const hash = window.location.hash || '';
      if (hash.startsWith('#post-')) {
        const targetId = hash.replace('#post-', '').trim();
        if (targetId) {
          setHighlightedPostId(targetId);
          setTimeout(() => {
            const el = document.getElementById(`post-card-${targetId}`);
            if (el) {
              el.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
          }, 300);
        }
      }
    };
    checkHash();
    window.addEventListener('hashchange', checkHash);
    return () => window.removeEventListener('hashchange', checkHash);
  }, [posts.length]);

  const handleRequestUserGps = () => {
    if (!navigator.geolocation) {
      toast.error('Geolocalização não suportada neste navegador.');
      return;
    }
    setGettingGps(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGettingGps(false);
        const coords = {
          lat: +pos.coords.latitude.toFixed(5),
          lng: +pos.coords.longitude.toFixed(5)
        };
        setUserGps(coords);
        toast.success('GPS ativado! Distâncias calculadas em tempo real 📍');
      },
      () => {
        setGettingGps(false);
        toast.error('Permissão de GPS negada ou indisponível.');
      },
      { enableHighAccuracy: true, timeout: 8000 }
    );
  };

  const handleCaptureGpsForNewPost = () => {
    if (!navigator.geolocation) {
      toast.error('GPS não disponível.');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const coords = {
          lat: +pos.coords.latitude.toFixed(5),
          lng: +pos.coords.longitude.toFixed(5)
        };
        setNewPostCoords(coords);
        setUserGps(coords);
        toast.success('Coordenadas GPS anexadas ao anúncio! 📍');
      },
      () => {
        toast.error('Não foi possível capturar o GPS.');
      }
    );
  };

  const handleRunSmartMatch = async (postId: string) => {
    setMatchingPostId(postId);
    try {
      const res = await api.findSmartPostMatches(postId);
      setMatchesByPostId((prev) => ({ ...prev, [postId]: res.matches }));
      if (res.matches.length === 0) {
        toast('Nenhuma publicação semelhante encontrada no momento.', { icon: '🔎' });
      } else {
        toast.success(`✨ Encontramos ${res.matches.length} possível(is) match(es)!`);
      }
    } catch {
      toast.error('Erro ao buscar correspondências com IA.');
    } finally {
      setMatchingPostId(null);
    }
  };

  const handleToggleSave = async (postId: string) => {
    if (!currentUser?.email) {
      onRequireAuth?.();
      return;
    }
    try {
      const updated = await api.toggleSavedPost(postId, currentUser.email);
      setSavedPostIds(updated);
      const isSaved = updated.includes(postId);
      toast.success(isSaved ? 'Anúncio salvo nos favoritos! 🔖' : 'Anúncio removido dos favoritos');
    } catch {
      toast.error('Erro ao salvar anúncio');
    }
  };

  // Handle Like
  const handleLike = async (postId: string) => {
    if (!currentUser?.email) {
      onRequireAuth?.();
      return;
    }
    const post = posts.find((p) => p.id === postId);
    if (!post) return;

    setPosts((prev) =>
      prev.map((p) => {
        if (p.id === postId) {
          return {
            ...p,
            likes: p.likedByMe ? p.likes - 1 : p.likes + 1,
            likedByMe: !p.likedByMe
          };
        }
        return p;
      })
    );

    try {
      const updated = await api.toggleLike(postId, currentUser.email);
      setPosts((prev) =>
        prev.map((p) =>
          p.id === postId ? { ...p, likes: updated.likes, likedByMe: updated.likedByMe } : p
        )
      );
    } catch (error) {
      console.error('Failed to toggle like:', error);
      toast.error('Erro ao curtir a publicação');
      setPosts((prev) =>
        prev.map((p) => {
          if (p.id === postId) {
            return { ...p, likes: post.likes, likedByMe: post.likedByMe };
          }
          return p;
        })
      );
    }
  };

  // Handle Image Upload with High-Performance Compression
  const handleImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      try {
        const compressed = await compressImageFile(file, {
          maxWidth: 1200,
          maxHeight: 1200,
          quality: 0.78
        });
        setNewPostImage(compressed);
      } catch (err: any) {
        toast.error(err?.message || 'Erro ao processar imagem');
      }
    }
  };

  // Handle Create Post
  const handleCreatePost = async () => {
    if (!currentUser) {
      onRequireAuth?.();
      return;
    }
    if (isSubmittingPost) return;
    if (!newPostTitle.trim() || !newPostPetName.trim() || !newPostLocation.trim()) {
      toast.error('Por favor, preencha todos os campos obrigatórios!');
      return;
    }

    setIsSubmittingPost(true);
    try {
      const nowIso = new Date().toISOString();
      const newPost = await api.createPost(
        {
          authorName: currentUser.name,
          authorEmail: currentUser.email,
          authorAvatar:
            currentUser.avatar ||
            'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&q=80&w=150',
          title: newPostTitle.trim(),
          petName: newPostPetName.trim(),
          category: newPostCategory,
          species: newPostSpecies,
          description: newPostDescription.trim(),
          location: newPostLocation.trim(),
          imageUrl:
            newPostImage ||
            'https://images.unsplash.com/photo-1548767797-d8c844163c4c?auto=format&fit=crop&q=80&w=800',
          phone: newPostPhone.trim() || undefined,
          lat: newPostCoords?.lat,
          lng: newPostCoords?.lng,
          date: nowIso,
          likes: 0
        },
        currentUser.email
      );

      setPosts((prev) => [{ ...newPost, createdAt: newPost.createdAt || nowIso }, ...prev]);
      setIsCreateModalOpen(false);

      // Reset form
      setNewPostTitle('');
      setNewPostPetName('');
      setNewPostDescription('');
      setNewPostLocation('');
      setNewPostPhone('');
      setNewPostImage('');
      setNewPostCoords(null);
      setNewPostSpecies('dog');
      setNewPostCategory('desaparecido');
      toast.success('Publicação criada com sucesso! 🐾');
    } catch (error) {
      console.error('Failed to create post:', error);
      toast.error('Erro ao criar publicação. Tente novamente.');
    } finally {
      setIsSubmittingPost(false);
    }
  };

  // Handle Add Comment
  const handleAddComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) {
      onRequireAuth?.();
      return;
    }
    if (!selectedPostForComments || !newCommentText.trim()) return;

    try {
      const nowIso = new Date().toISOString();
      const comment = await api.addComment(
        selectedPostForComments.id,
        {
          authorName: currentUser.name,
          authorAvatar:
            currentUser.avatar ||
            'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&q=80&w=150',
          text: newCommentText.trim(),
          date: nowIso
        },
        currentUser.email
      );

      const updatedPosts = posts.map((p) => {
        if (p.id === selectedPostForComments.id) {
          const currentComments = p.comments || [];
          return {
            ...p,
            comments: [...currentComments, comment]
          };
        }
        return p;
      });

      setPosts(updatedPosts);
      setSelectedPostForComments((prev) =>
        prev
          ? {
              ...prev,
              comments: [...(prev.comments || []), comment]
            }
          : null
      );

      setNewCommentText('');
      toast.success('Comentário enviado!');
    } catch (error) {
      console.error('Failed to add comment:', error);
      toast.error('Erro ao adicionar comentário.');
    }
  };

  // Toggle status (resolvido / ativo)
  const handleToggleStatus = async (post: Post) => {
    if (!currentUser) return;
    const nextStatus = post.status === 'resolvido' ? 'ativo' : 'resolvido';
    try {
      const updated = await api.updatePostStatus(post.id, nextStatus, currentUser.email);
      setPosts((prev) => prev.map((p) => (p.id === post.id ? updated : p)));
      toast.success(
        nextStatus === 'resolvido'
          ? '🎉 Parabéns! Publicação marcada como resolvida!'
          : 'Publicação reaberta!'
      );
    } catch (err: any) {
      toast.error(err.message || 'Erro ao alterar status');
    }
  };

  // Delete post
  const handleDeletePost = async (postId: string) => {
    if (!currentUser) return;
    if (!confirm('Tem certeza que deseja excluir esta publicação?')) return;
    try {
      await api.deletePost(postId, currentUser.email);
      setPosts((prev) => prev.filter((p) => p.id !== postId));
      toast.success('Publicação excluída.');
    } catch (err: any) {
      toast.error(err.message || 'Erro ao excluir publicação');
    }
  };

  // Filter posts (including optional GPS radius filter)
  const filteredPosts = useMemo(() => {
    return posts.filter((post) => {
      if (activeFilter !== 'todos') {
        const normPost = (post.category || '').toLowerCase().replace('ç', 'c').replace('ã', 'a');
        const normActive = activeFilter.toLowerCase().replace('ç', 'c').replace('ã', 'a');
        if (normPost !== normActive) return false;
      }

      if (statusView === 'ativos' && post.status === 'resolvido') return false;
      if (statusView === 'resolvidos' && post.status !== 'resolvido') return false;

      if (speciesFilter !== 'todos') {
        const effSpecies = inferSpecies(post);
        if (effSpecies !== speciesFilter) return false;
      }

      if (onlySaved && !savedPostIds.includes(post.id)) return false;

      if (userGps && maxDistanceKm !== null) {
        const coords = resolvePostCoordinates(post);
        const dist = calculateDistanceKm(userGps.lat, userGps.lng, coords.lat, coords.lng);
        if (dist > maxDistanceKm) return false;
      }

      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const matchesTitle = post.title.toLowerCase().includes(query);
        const matchesPet = post.petName.toLowerCase().includes(query);
        const matchesLoc = post.location.toLowerCase().includes(query);
        const matchesDesc = post.description.toLowerCase().includes(query);
        if (!matchesTitle && !matchesPet && !matchesLoc && !matchesDesc) return false;
      }

      return true;
    });
  }, [
    posts,
    activeFilter,
    statusView,
    speciesFilter,
    onlySaved,
    savedPostIds,
    searchQuery,
    userGps,
    maxDistanceKm
  ]);

  // Direct WhatsApp Contact
  const handleWhatsAppClick = (phone: string, petName: string) => {
    const cleanPhone = phone.replace(/\D/g, '');
    const message = encodeURIComponent(
      `Olá! Vi sua publicação no UniãoPet sobre o(a) ${petName} e gostaria de ajudar.`
    );
    window.open(`https://wa.me/55${cleanPhone}?text=${message}`, '_blank');
  };

  // Share post link
  const handleSharePostLink = (post: Post) => {
    const deepUrl = getPostDeepLink(post.id);
    if (navigator.share) {
      navigator
        .share({
          title: `UniãoPet - ${post.title}`,
          text: `${post.title}: ${post.description}`,
          url: deepUrl
        })
        .catch(() => {});
    } else {
      navigator.clipboard.writeText(deepUrl);
      toast.success('Link direto do anúncio copiado!');
    }
  };

  return (
    <div className="pb-24 max-w-2xl mx-auto px-4 pt-5">
      {/* Search, View Mode & Filters Header */}
      <div className="mb-6 space-y-3 sticky top-0 glass-surface pt-2.5 pb-3.5 z-20 -mx-4 px-4 border-b border-slate-200/60">
        <div className="flex items-center gap-2.5">
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input
              type="text"
              placeholder="Buscar por nome, raça, bairro ou cidade..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-white border border-slate-200/90 rounded-2xl py-3 pl-10 pr-4 text-sm focus:outline-none focus:border-[#f08136] focus:ring-2 focus:ring-[#f08136]/15 shadow-2xs transition-all"
            />
          </div>

          {/* Toggle List vs Radar Map */}
          <div className="flex bg-slate-100 p-1 rounded-2xl border border-slate-200/70 shrink-0">
            <button
              onClick={() => setViewMode('list')}
              className={`px-3 py-2 rounded-xl text-xs font-extrabold flex items-center gap-1.5 transition-all cursor-pointer ${
                viewMode === 'list'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
              title="Visualização em Lista"
            >
              <LayoutList size={15} />
              <span className="hidden sm:inline">Feed</span>
            </button>
            <button
              onClick={() => setViewMode('map')}
              className={`px-3 py-2 rounded-xl text-xs font-extrabold flex items-center gap-1.5 transition-all cursor-pointer ${
                viewMode === 'map'
                  ? 'bg-white text-[#f08136] shadow-xs'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
              title="Radar & Mapa de Pets"
            >
              <MapIcon size={15} />
              <span className="hidden sm:inline">Mapa</span>
            </button>
          </div>

          <button
            id="btn-new-post-header"
            onClick={() => {
              if (!currentUser) {
                onRequireAuth?.();
                return;
              }
              setIsCreateModalOpen(true);
            }}
            className="w-11 h-11 bg-gradient-to-br from-[#f08136] to-[#e06310] hover:from-[#e66c19] hover:to-[#c95308] text-white rounded-2xl shadow-md shadow-[#f08136]/25 flex items-center justify-center transition-all cursor-pointer active:scale-95 shrink-0"
            title="Publicar Anúncio"
          >
            <Plus size={22} strokeWidth={2.5} />
          </button>
        </div>

        {/* Category + Saved + GPS Distance Filters */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar">
          <FilterChip
            label="Todos os Anúncios"
            active={activeFilter === 'todos' && !onlySaved}
            onClick={() => {
              setActiveFilter('todos');
              setOnlySaved(false);
            }}
          />
          <FilterChip
            label="🚨 Desaparecidos"
            active={activeFilter === 'desaparecido' && !onlySaved}
            onClick={() => {
              setActiveFilter('desaparecido');
              setOnlySaved(false);
            }}
          />
          <FilterChip
            label="❤️ Para Adoção"
            active={(activeFilter === 'adocao' || activeFilter === 'adoção') && !onlySaved}
            onClick={() => {
              setActiveFilter('adocao');
              setOnlySaved(false);
            }}
          />
          <FilterChip
            label="🎁 Doações"
            active={(activeFilter === 'doacao' || activeFilter === 'doação') && !onlySaved}
            onClick={() => {
              setActiveFilter('doacao');
              setOnlySaved(false);
            }}
          />
          {currentUser && (
            <button
              onClick={() => setOnlySaved(!onlySaved)}
              className={`px-4 py-2 rounded-full text-xs font-bold whitespace-nowrap transition-all cursor-pointer flex items-center gap-1.5 ${
                onlySaved
                  ? 'bg-amber-500 text-white shadow-xs'
                  : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
              }`}
            >
              <Bookmark size={13} className={onlySaved ? 'fill-current' : ''} />
              Salvos ({savedPostIds.length})
            </button>
          )}
        </div>

        {/* Species & Status Quick Filters */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-1.5 border-t border-slate-100">
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5">
            {[
              { id: 'todos', label: 'Todos', icon: '🐾' },
              { id: 'dog', label: 'Cães', icon: '🐶' },
              { id: 'cat', label: 'Gatos', icon: '🐱' },
              { id: 'bird', label: 'Aves', icon: '🦜' },
              { id: 'other', label: 'Outros', icon: '✨' }
            ].map((sp) => (
              <button
                key={sp.id}
                onClick={() => setSpeciesFilter(sp.id as any)}
                className={`px-3 py-1.5 rounded-xl text-[11px] font-extrabold flex items-center gap-1.5 transition-all cursor-pointer shrink-0 ${
                  speciesFilter === sp.id
                    ? 'bg-[#f08136] text-white shadow-xs'
                    : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
                }`}
              >
                <span>{sp.icon}</span>
                <span>{sp.label}</span>
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1 shrink-0 overflow-x-auto no-scrollbar py-0.5">
            {(['todos', 'ativos', 'resolvidos'] as const).map((s) => (
              <button
                key={s}
                onClick={() => setStatusView(s)}
                className={`px-3 py-1 rounded-xl text-[11px] font-bold transition-all cursor-pointer shrink-0 capitalize ${
                  statusView === s
                    ? 'bg-slate-900 text-white shadow-xs'
                    : 'bg-slate-100 text-slate-500 hover:text-slate-800'
                }`}
              >
                {s === 'todos' ? 'Status: Todos' : s}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Interactive Radar & GPS Map View */}
      {viewMode === 'map' && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-6 bg-white rounded-3xl border border-slate-200/80 shadow-md overflow-hidden"
        >
          <div className="p-4 bg-slate-900 text-white flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-black flex items-center gap-2">
                <MapIcon size={16} className="text-[#f08136]" />
                <span>Radar Geográfico de Pets ({filteredPosts.length})</span>
              </h3>
              <p className="text-[11px] text-slate-400">
                Toque nos pins para abrir o anúncio ou filtre por raio de distância do seu GPS
              </p>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <button
                onClick={handleRequestUserGps}
                disabled={gettingGps}
                className={`px-3 py-1.5 rounded-xl text-xs font-extrabold flex items-center gap-1.5 cursor-pointer transition-all ${
                  userGps
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                    : 'bg-[#f08136] hover:bg-[#d96e27] text-white'
                }`}
              >
                <Navigation size={13} className={gettingGps ? 'animate-spin' : ''} />
                <span>{userGps ? 'GPS Ativo' : 'Ativar Meu GPS'}</span>
              </button>

              {userGps && (
                <div className="flex items-center gap-1 bg-slate-800 p-1 rounded-xl">
                  {[
                    { label: 'Todos', km: null },
                    { label: '5km', km: 5 },
                    { label: '15km', km: 15 },
                    { label: '50km', km: 50 }
                  ].map((r) => (
                    <button
                      key={r.label}
                      onClick={() => setMaxDistanceKm(r.km)}
                      className={`px-2 py-1 rounded-lg text-[10px] font-black cursor-pointer transition-all ${
                        maxDistanceKm === r.km
                          ? 'bg-[#f08136] text-white'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      {r.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Interactive Visual Radar Canvas */}
          <div className="relative h-80 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 overflow-hidden select-none">
            {/* Radar concentric rings */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-25">
              <div className="w-28 h-28 rounded-full border border-emerald-400/60" />
              <div className="absolute w-56 h-56 rounded-full border border-emerald-400/40" />
              <div className="absolute w-80 h-80 rounded-full border border-emerald-400/30" />
              <div className="absolute w-[28rem] h-[28rem] rounded-full border border-emerald-400/20" />
              <div className="absolute inset-x-0 h-px bg-emerald-400/20" />
              <div className="absolute inset-y-0 w-px bg-emerald-400/20" />
            </div>

            {/* Center User GPS Pin */}
            <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-10 flex flex-col items-center pointer-events-none">
              <div className="w-4 h-4 rounded-full bg-sky-400 ring-4 ring-sky-400/30 animate-ping absolute" />
              <div className="w-4 h-4 rounded-full bg-sky-400 border-2 border-white shadow-md relative" />
              <span className="mt-1 px-2 py-0.5 rounded-full bg-slate-950/80 text-[9px] font-black text-sky-300">
                {userGps ? 'Você (GPS)' : 'Centro da Região'}
              </span>
            </div>

            {/* Pet Pins plotted around radar */}
            {filteredPosts.slice(0, 18).map((post, idx) => {
              const coords = resolvePostCoordinates(post);
              const angle = (idx * 137.5 * Math.PI) / 180;
              const radiusPct = 16 + ((idx * 19) % 30);
              const leftPct = 50 + Math.cos(angle) * radiusPct;
              const topPct = 50 + Math.sin(angle) * radiusPct;

              const isLost = post.category === 'desaparecido';
              const isAdopt = post.category === 'adoção' || post.category === 'adocao';
              const ringColor = isLost
                ? 'border-red-500 ring-red-500/40'
                : isAdopt
                ? 'border-emerald-400 ring-emerald-400/40'
                : 'border-purple-400 ring-purple-400/40';

              const distKm = userGps
                ? calculateDistanceKm(userGps.lat, userGps.lng, coords.lat, coords.lng)
                : null;

              return (
                <button
                  key={post.id}
                  onClick={() => setSelectedMapPost(post)}
                  style={{ left: `${leftPct}%`, top: `${topPct}%` }}
                  className="absolute -translate-x-1/2 -translate-y-1/2 group z-20 flex flex-col items-center cursor-pointer focus:outline-none"
                >
                  <div
                    className={`w-11 h-11 rounded-full overflow-hidden border-2 ${ringColor} ring-4 shadow-lg transition-transform group-hover:scale-125 bg-slate-800`}
                  >
                    <img
                      src={post.imageUrl}
                      alt={post.petName}
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <span
                    className={`mt-1 px-2 py-0.5 rounded-full text-[10px] font-black shadow-md whitespace-nowrap ${
                      isLost
                        ? 'bg-red-600 text-white'
                        : isAdopt
                        ? 'bg-emerald-600 text-white'
                        : 'bg-purple-600 text-white'
                    }`}
                  >
                    {post.petName || 'Pet'} {distKm !== null ? `• ${distKm}km` : ''}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Selected Pin Drawer */}
          {selectedMapPost && (
            <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <img
                  src={selectedMapPost.imageUrl}
                  alt={selectedMapPost.petName}
                  className="w-14 h-14 rounded-2xl object-cover border border-slate-200 shrink-0"
                />
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-black text-sm text-slate-900 truncate">
                      {selectedMapPost.petName || selectedMapPost.title}
                    </span>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-orange-100 text-[#f08136] uppercase">
                      {selectedMapPost.category}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 truncate mt-0.5">
                    📍 {selectedMapPost.location}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <a
                  href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                    selectedMapPost.location
                  )}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-3 py-2 rounded-xl bg-white border border-slate-200 text-slate-700 text-xs font-bold flex items-center gap-1 hover:bg-slate-100"
                >
                  <span>Abrir Maps</span>
                  <ExternalLink size={12} />
                </a>
                <button
                  onClick={() => {
                    const id = selectedMapPost.id;
                    setViewMode('list');
                    setHighlightedPostId(id);
                    setTimeout(() => {
                      document
                        .getElementById(`post-card-${id}`)
                        ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    }, 150);
                  }}
                  className="px-3.5 py-2 rounded-xl bg-[#f08136] text-white text-xs font-bold cursor-pointer"
                >
                  Ver Anúncio
                </button>
              </div>
            </div>
          )}
        </motion.div>
      )}

      {/* Posts List */}
      <div className="space-y-6">
        {filteredPosts.length === 0 ? (
          <div className="text-center py-16 bg-white rounded-3xl border border-slate-100 p-8 shadow-xs">
            <div className="w-16 h-16 bg-orange-50 text-[#f08136] rounded-full flex items-center justify-center mx-auto mb-4">
              <Search size={28} />
            </div>
            <h3 className="text-lg font-bold text-slate-800 mb-1">Nenhum anúncio encontrado</h3>
            <p className="text-sm text-slate-500 max-w-sm mx-auto mb-5">
              {onlySaved
                ? 'Você ainda não salvou nenhum anúncio. Toque no ícone 🔖 em qualquer publicação para guardar aqui!'
                : 'Não encontramos anúncios com os filtros atuais. Seja o primeiro tutor a publicar!'}
            </p>
            <button
              onClick={() => {
                if (!currentUser) {
                  onRequireAuth?.();
                  return;
                }
                setIsCreateModalOpen(true);
              }}
              className="inline-flex items-center gap-2 bg-[#f08136] hover:bg-[#e66c19] text-white font-bold text-sm px-5 py-3 rounded-2xl shadow-md shadow-[#f08136]/20 transition-all cursor-pointer"
            >
              <Plus size={18} />
              Criar Nova Publicação
            </button>
          </div>
        ) : (
          filteredPosts.map((post) => {
            const isOwner = currentUser
              ? post.authorEmail
                ? post.authorEmail === currentUser.email
                : post.authorName === currentUser.name
              : false;
            const postCoords = resolvePostCoordinates(post);
            const distanceKm = userGps
              ? calculateDistanceKm(userGps.lat, userGps.lng, postCoords.lat, postCoords.lng)
              : null;
            const postMatches = matchesByPostId[post.id];

            return (
              <motion.div
                id={`post-card-${post.id}`}
                key={post.id}
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                className={`bigtech-card rounded-[2rem] overflow-hidden ${
                  highlightedPostId === post.id ? 'highlight-deeplink ring-2 ring-[#f08136]' : ''
                }`}
              >
                <div className="p-4 sm:p-5 flex items-center justify-between gap-3">
                  <div
                    onClick={() => {
                      if (!currentUser) {
                        onRequireAuth?.();
                        return;
                      }
                      if (!isOwner) {
                        onStartChat(post);
                      }
                    }}
                    className="flex items-center gap-3 cursor-pointer group min-w-0 flex-1"
                    title="Enviar mensagem"
                  >
                    <img
                      src={post.authorAvatar}
                      alt={post.authorName}
                      className="w-10 h-10 sm:w-11 sm:h-11 rounded-full object-cover border-2 border-white shadow-sm group-hover:scale-105 transition-transform shrink-0"
                    />
                    <div className="min-w-0 flex-1">
                      <h3 className="font-bold text-slate-800 text-sm leading-tight mb-1 group-hover:text-[#f08136] transition-colors truncate">
                        {post.authorName}
                      </h3>
                      <div className="flex items-center gap-2 text-[11px] font-medium text-slate-400">
                        <span>{formatRelativeTime(post.createdAt || post.date)}</span>
                        {distanceKm !== null && (
                          <span className="text-emerald-600 font-bold">• a {distanceKm} km</span>
                        )}
                      </div>
                    </div>
                  </div>

                  {post.status === 'resolvido' ? (
                    <span className="px-3 py-1 rounded-full text-xs font-black tracking-wide uppercase bg-emerald-100 text-emerald-800 border border-emerald-200 flex items-center gap-1 shadow-2xs shrink-0 whitespace-nowrap">
                      <CheckCircle2 size={13} />
                      {post.category === 'desaparecido'
                        ? 'Encontrado!'
                        : post.category === 'adocao' || post.category === 'adoção'
                        ? 'Adotado!'
                        : 'Resolvido!'}
                    </span>
                  ) : (
                    <span
                      className={`px-3 py-1 rounded-full text-xs font-bold tracking-wide uppercase shrink-0 whitespace-nowrap ${
                        post.category === 'desaparecido'
                          ? 'bg-red-50 text-red-600 border border-red-100'
                          : post.category === 'adocao' || post.category === 'adoção'
                          ? 'bg-emerald-50 text-emerald-600 border border-emerald-100'
                          : 'bg-purple-50 text-purple-700 border border-purple-100'
                      }`}
                    >
                      {post.category === 'desaparecido'
                        ? '🚨 Pet Perdido'
                        : post.category === 'adocao' || post.category === 'adoção'
                        ? '❤️ Para Adoção'
                        : '🎁 Doação'}
                    </span>
                  )}
                </div>

                {/* Author Management Banner */}
                {isOwner && (
                  <div className="mx-5 mb-3 p-2.5 rounded-2xl bg-orange-50/80 border border-orange-100 flex items-center justify-between text-xs">
                    <span className="text-slate-700 font-bold flex items-center gap-1.5">
                      🐾 Sua publicação
                    </span>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleToggleStatus(post)}
                        className={`px-3 py-1 font-extrabold rounded-xl border transition-all cursor-pointer shadow-2xs ${
                          post.status === 'resolvido'
                            ? 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-200'
                            : 'bg-emerald-600 hover:bg-emerald-700 text-white border-emerald-600'
                        }`}
                      >
                        {post.status === 'resolvido'
                          ? 'Reabrir'
                          : post.category === 'desaparecido'
                          ? 'Marcar Encontrado 🎉'
                          : 'Marcar Adotado 🏠'}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeletePost(post.id)}
                        className="p-1.5 text-red-500 hover:bg-red-100 rounded-lg transition-colors cursor-pointer"
                        title="Excluir post"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </div>
                )}

                <div className="px-5 pb-3">
                  <h2 className="text-lg font-extrabold text-slate-900 mb-1.5 leading-tight">
                    {post.title}
                  </h2>
                  <p className="text-slate-600 text-sm leading-relaxed mb-4">{post.description}</p>

                  <div className="flex flex-col gap-2 bg-slate-50/90 p-3 rounded-2xl mb-2 border border-slate-100">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 text-xs font-semibold text-slate-700 min-w-0">
                        <div className="p-1.5 bg-white rounded-lg shadow-xs shrink-0">
                          <MapPin size={14} className="text-[#f08136]" />
                        </div>
                        <span className="truncate">{post.location}</span>
                      </div>

                      <a
                        href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                          post.location
                        )}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[11px] font-bold text-[#f08136] hover:underline flex items-center gap-1 shrink-0"
                      >
                        <span>Ver no Mapa</span>
                        <ExternalLink size={11} />
                      </a>
                    </div>

                    {post.phone && (
                      <div className="flex items-center justify-between gap-2 bg-emerald-50/80 border border-emerald-100 p-2 rounded-xl mt-1">
                        <div className="flex items-center gap-2 text-xs font-semibold text-emerald-900">
                          <div className="p-1.5 bg-white rounded-lg shadow-xs text-emerald-600">
                            <Phone size={13} />
                          </div>
                          {post.phone}
                        </div>
                        <button
                          type="button"
                          onClick={() => handleWhatsAppClick(post.phone!, post.petName)}
                          className="inline-flex items-center gap-1 bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-extrabold px-3 py-1.5 rounded-lg shadow-xs transition-all cursor-pointer active:scale-95"
                        >
                          <span>Conversar no WhatsApp</span>
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                {/* Pet Image */}
                <div className="w-full h-72 bg-slate-100 relative group overflow-hidden">
                  <img
                    src={post.imageUrl}
                    alt={post.title}
                    className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                    onError={(e) => {
                      const target = e.target as HTMLImageElement;
                      target.src =
                        'https://images.unsplash.com/photo-1548767797-d8c844163c4c?auto=format&fit=crop&q=80&w=800';
                    }}
                  />
                </div>

                {/* AI Smart Match Results Drawer */}
                {postMatches && postMatches.length > 0 && (
                  <div className="mx-4 mt-3 p-3.5 rounded-2xl bg-gradient-to-r from-amber-50 via-orange-50 to-amber-50 border border-orange-200/80">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-black text-slate-900 flex items-center gap-1.5">
                        <Sparkles size={14} className="text-[#f08136]" />
                        Possíveis Correspondências Encontradas pela IA ({postMatches.length})
                      </span>
                      <button
                        onClick={() =>
                          setMatchesByPostId((prev) => {
                            const copy = { ...prev };
                            delete copy[post.id];
                            return copy;
                          })
                        }
                        className="text-slate-400 hover:text-slate-700 cursor-pointer"
                      >
                        <X size={14} />
                      </button>
                    </div>
                    <div className="space-y-2">
                      {postMatches.map((m) => (
                        <div
                          key={m.post.id}
                          onClick={() => {
                            setHighlightedPostId(m.post.id);
                            document
                              .getElementById(`post-card-${m.post.id}`)
                              ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                          }}
                          className="bg-white p-2.5 rounded-xl border border-orange-100 flex items-center justify-between gap-3 cursor-pointer hover:border-[#f08136] transition-all"
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <img
                              src={m.post.imageUrl}
                              alt={m.post.petName}
                              className="w-10 h-10 rounded-lg object-cover shrink-0"
                            />
                            <div className="min-w-0">
                              <p className="text-xs font-extrabold text-slate-900 truncate">
                                {m.post.petName || m.post.title} • {m.post.location}
                              </p>
                              <p className="text-[10px] text-slate-500 truncate">
                                {m.reasons.join(' • ')}
                              </p>
                            </div>
                          </div>
                          <span className="px-2 py-1 rounded-lg bg-emerald-100 text-emerald-800 text-[10px] font-black shrink-0">
                            {m.score}% Match
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Action Bar */}
                <div className="p-2.5 sm:p-3 border-t border-slate-100 flex items-center justify-between gap-1.5 overflow-hidden">
                  <div className="flex items-center gap-0.5 sm:gap-1 min-w-0 flex-1 overflow-x-auto no-scrollbar">
                    <button
                      type="button"
                      onClick={() => handleLike(post.id)}
                      className={`flex items-center gap-1.5 px-2.5 sm:px-3.5 py-2 rounded-xl font-bold text-xs sm:text-sm transition-all cursor-pointer shrink-0 ${
                        post.likedByMe
                          ? 'text-red-500 bg-red-50'
                          : 'text-slate-500 hover:bg-slate-50'
                      }`}
                    >
                      <Heart size={18} className={post.likedByMe ? 'fill-current' : ''} />
                      <span>{post.likes}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setSelectedPostForComments(post)}
                      className="flex items-center gap-1.5 px-2.5 sm:px-3.5 py-2 rounded-xl text-slate-500 hover:bg-slate-50 font-bold text-xs sm:text-sm transition-all cursor-pointer shrink-0"
                    >
                      <MessageSquare size={18} />
                      <span>{post.comments?.length || 0}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleToggleSave(post.id)}
                      className={`p-2 sm:p-2.5 rounded-xl transition-all cursor-pointer shrink-0 ${
                        savedPostIds.includes(post.id)
                          ? 'text-amber-500 bg-amber-50'
                          : 'text-slate-400 hover:text-slate-700 hover:bg-slate-50'
                      }`}
                      title={
                        savedPostIds.includes(post.id) ? 'Remover dos favoritos' : 'Salvar anúncio'
                      }
                    >
                      <Bookmark
                        size={17}
                        className={savedPostIds.includes(post.id) ? 'fill-current' : ''}
                      />
                    </button>

                    <button
                      type="button"
                      onClick={() => setSelectedPostForFlyer(post)}
                      className="px-2.5 py-2 text-slate-600 hover:text-[#f08136] hover:bg-orange-50 rounded-xl transition-all cursor-pointer shrink-0 flex items-center gap-1 text-xs font-bold"
                      title="Gerar Cartaz c/ QR Code ou Imagem para Stories"
                    >
                      <FileText size={16} />
                      <span className="hidden sm:inline">Cartaz QR</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleRunSmartMatch(post.id)}
                      disabled={matchingPostId === post.id}
                      className="px-2.5 py-2 text-amber-700 bg-amber-50 hover:bg-amber-100 rounded-xl transition-all cursor-pointer shrink-0 flex items-center gap-1 text-xs font-bold"
                      title="Cruzar características com outros anúncios via IA"
                    >
                      <Sparkles
                        size={15}
                        className={matchingPostId === post.id ? 'animate-spin' : ''}
                      />
                      <span className="hidden sm:inline">Match IA</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleSharePostLink(post)}
                      className="p-2 sm:p-2.5 text-[#f08136] bg-orange-50 hover:bg-orange-100 rounded-xl transition-all cursor-pointer shrink-0"
                      title="Compartilhar Link Direto"
                    >
                      <Share2 size={16} />
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      if (!currentUser) {
                        onRequireAuth?.();
                        return;
                      }
                      if (!isOwner) {
                        onStartChat(post);
                      } else {
                        toast.error('Você não pode enviar mensagem para você mesmo.');
                      }
                    }}
                    className={`shrink-0 flex items-center gap-1.5 px-3 sm:px-4 py-2 rounded-xl font-bold text-xs sm:text-sm transition-all cursor-pointer ${
                      isOwner
                        ? 'bg-slate-100 text-slate-400 opacity-60'
                        : 'bg-[#fdf2e9] text-[#f08136] hover:bg-[#f08136] hover:text-white shadow-2xs'
                    }`}
                  >
                    <Send
                      size={15}
                      className={isOwner ? '' : 'transform -rotate-45 -mt-0.5'}
                    />
                    <span>{isOwner ? 'Seu post' : 'Mensagem'}</span>
                  </button>
                </div>
              </motion.div>
            );
          })
        )}
      </div>

      {/* Comment Modal */}
      <AnimatePresence>
        {selectedPostForComments && (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-950/50 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, y: '100%' }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="bg-white w-full max-w-lg sm:rounded-3xl rounded-t-[2rem] shadow-2xl flex flex-col max-h-[85vh]"
            >
              <div className="p-4 border-b border-slate-100 flex items-center justify-between sticky top-0 bg-white z-10 rounded-t-[2rem]">
                <div className="flex items-center gap-3">
                  <h2 className="font-extrabold text-lg text-slate-800">Comentários</h2>
                  <span className="bg-slate-100 text-slate-600 px-2.5 py-0.5 rounded-full text-xs font-bold">
                    {selectedPostForComments.comments?.length || 0}
                  </span>
                </div>
                <button
                  onClick={() => setSelectedPostForComments(null)}
                  className="p-2 bg-slate-50 hover:bg-slate-100 rounded-full text-slate-500 transition-colors cursor-pointer"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-5 space-y-5 bg-slate-50/50">
                {!selectedPostForComments.comments ||
                selectedPostForComments.comments.length === 0 ? (
                  <div className="text-center py-10">
                    <MessageSquare size={32} className="mx-auto text-slate-300 mb-3" />
                    <p className="text-slate-500 font-medium">
                      Nenhum comentário ainda.
                      <br />
                      Seja o primeiro a comentar!
                    </p>
                  </div>
                ) : (
                  selectedPostForComments.comments.map((comment) => (
                    <div key={comment.id} className="flex gap-3">
                      <img
                        src={comment.authorAvatar}
                        alt={comment.authorName}
                        className="w-8 h-8 rounded-full object-cover shrink-0 mt-1"
                      />
                      <div className="bg-white p-3.5 rounded-2xl rounded-tl-none shadow-sm border border-slate-100 flex-1">
                        <div className="flex items-baseline justify-between mb-1">
                          <span className="font-bold text-sm text-slate-800">
                            {comment.authorName}
                          </span>
                          <span className="text-[10px] text-slate-400 font-medium">
                            {formatRelativeTime(comment.createdAt || comment.date)}
                          </span>
                        </div>
                        <p className="text-sm text-slate-600 leading-relaxed">{comment.text}</p>
                      </div>
                    </div>
                  ))
                )}
              </div>

              <div className="p-4 bg-white border-t border-slate-100 rounded-b-3xl">
                <form onSubmit={handleAddComment} className="flex items-center gap-2 relative">
                  <input
                    type="text"
                    value={newCommentText}
                    onChange={(e) => setNewCommentText(e.target.value)}
                    placeholder={
                      currentUser
                        ? 'Adicione um comentário...'
                        : 'Faça login para comentar nesta publicação...'
                    }
                    className="flex-1 bg-slate-50 border border-slate-200 rounded-full py-3.5 pl-5 pr-14 text-sm focus:outline-none focus:border-[#f08136] focus:ring-1 focus:ring-[#f08136] transition-all"
                  />
                  <button
                    type="submit"
                    disabled={!newCommentText.trim()}
                    className="absolute right-2 p-2 bg-[#f08136] hover:bg-[#e66c19] text-white rounded-full disabled:opacity-50 disabled:bg-slate-300 transition-all cursor-pointer shadow-md shadow-[#f08136]/20"
                  >
                    <Send size={16} className="-ml-0.5 mt-0.5" />
                  </button>
                </form>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Create Post Modal */}
      <AnimatePresence>
        {isCreateModalOpen && (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-950/50 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, y: '100%' }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="bg-white w-full max-w-lg sm:rounded-3xl rounded-t-[2rem] shadow-2xl flex flex-col max-h-[90vh]"
            >
              <div className="p-4 border-b border-slate-100 flex items-center justify-between sticky top-0 bg-white z-10 rounded-t-[2rem]">
                <h2 className="font-extrabold text-lg text-slate-800">Nova Publicação</h2>
                <button
                  onClick={() => setIsCreateModalOpen(false)}
                  className="p-2 bg-slate-50 hover:bg-slate-100 rounded-full text-slate-500 transition-colors cursor-pointer"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-5 space-y-4">
                {/* Category Selection */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-2 uppercase tracking-wide">
                    Categoria
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    <button
                      type="button"
                      onClick={() => setNewPostCategory('desaparecido')}
                      className={`p-2.5 rounded-xl border flex flex-col items-center justify-center gap-1 font-bold text-xs cursor-pointer transition-all ${
                        newPostCategory === 'desaparecido'
                          ? 'border-red-500 bg-red-50 text-red-600 shadow-2xs'
                          : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      <span className="text-lg">🚨</span>
                      <span>Pet Perdido</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setNewPostCategory('adocao')}
                      className={`p-2.5 rounded-xl border flex flex-col items-center justify-center gap-1 font-bold text-xs cursor-pointer transition-all ${
                        newPostCategory === 'adocao' || newPostCategory === 'adoção'
                          ? 'border-green-500 bg-green-50 text-green-600 shadow-2xs'
                          : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      <Heart size={18} />
                      <span>Para Adoção</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setNewPostCategory('doacao')}
                      className={`p-2.5 rounded-xl border flex flex-col items-center justify-center gap-1 font-bold text-xs cursor-pointer transition-all ${
                        newPostCategory === 'doacao' || newPostCategory === 'doação'
                          ? 'border-purple-500 bg-purple-50 text-purple-600 shadow-2xs'
                          : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      <span className="text-lg">🎁</span>
                      <span>Doações</span>
                    </button>
                  </div>
                </div>

                {/* Species Selector */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-2 uppercase tracking-wide">
                    Espécie
                  </label>
                  <div className="grid grid-cols-4 gap-2">
                    {[
                      { id: 'dog', label: 'Cachorro', icon: '🐶' },
                      { id: 'cat', label: 'Gato', icon: '🐱' },
                      { id: 'bird', label: 'Pássaro', icon: '🦜' },
                      { id: 'other', label: 'Outro', icon: '🐾' }
                    ].map((sp) => (
                      <button
                        key={sp.id}
                        type="button"
                        onClick={() => setNewPostSpecies(sp.id as any)}
                        className={`p-2.5 rounded-xl border text-xs font-bold flex flex-col items-center gap-1 transition-all cursor-pointer ${
                          newPostSpecies === sp.id
                            ? 'border-[#f08136] bg-[#f08136]/10 text-[#f08136]'
                            : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                        }`}
                      >
                        <span className="text-base">{sp.icon}</span>
                        {sp.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-2 uppercase tracking-wide">
                    Título do anúncio
                  </label>
                  <input
                    type="text"
                    value={newPostTitle}
                    onChange={(e) => setNewPostTitle(e.target.value)}
                    placeholder="Ex: Procura-se Rex - Desaparecido na Vila Nova"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl py-3 px-4 text-sm focus:outline-none focus:border-[#f08136] focus:bg-white transition-all"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-2 uppercase tracking-wide">
                      Nome do Pet
                    </label>
                    <input
                      type="text"
                      value={newPostPetName}
                      onChange={(e) => setNewPostPetName(e.target.value)}
                      placeholder="Ex: Rex"
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl py-3 px-4 text-sm focus:outline-none focus:border-[#f08136] focus:bg-white transition-all"
                    />
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="block text-xs font-bold text-slate-700 uppercase tracking-wide">
                        Bairro / Cidade
                      </label>
                      <button
                        type="button"
                        onClick={handleCaptureGpsForNewPost}
                        className="text-[10px] font-extrabold text-[#f08136] hover:underline flex items-center gap-0.5 cursor-pointer"
                      >
                        <Navigation size={10} />
                        <span>{newPostCoords ? 'GPS Salvo ✓' : 'Anexar GPS'}</span>
                      </button>
                    </div>
                    <input
                      type="text"
                      value={newPostLocation}
                      onChange={(e) => setNewPostLocation(e.target.value)}
                      placeholder="Ex: Centro, SP"
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl py-3 px-4 text-sm focus:outline-none focus:border-[#f08136] focus:bg-white transition-all"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-2 uppercase tracking-wide">
                    Descrição detalhada
                  </label>
                  <textarea
                    value={newPostDescription}
                    onChange={(e) => setNewPostDescription(e.target.value)}
                    placeholder="Descreva as características, cor da pelagem, coleira, temperamento..."
                    rows={3}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl py-3 px-4 text-sm focus:outline-none focus:border-[#f08136] focus:bg-white transition-all resize-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-2 uppercase tracking-wide">
                    WhatsApp / Telefone para contato
                  </label>
                  <input
                    type="text"
                    value={newPostPhone}
                    onChange={(e) => setNewPostPhone(e.target.value)}
                    placeholder="(11) 99999-9999"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl py-3 px-4 text-sm focus:outline-none focus:border-[#f08136] focus:bg-white transition-all"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-2 uppercase tracking-wide">
                    Foto do Pet
                  </label>
                  {newPostImage ? (
                    <div className="relative rounded-2xl overflow-hidden h-40 group">
                      <img src={newPostImage} alt="Preview" className="w-full h-full object-cover" />
                      <button
                        onClick={() => setNewPostImage('')}
                        className="absolute top-2 right-2 p-1.5 bg-black/50 text-white rounded-full hover:bg-black/70 backdrop-blur-sm transition-colors"
                      >
                        <X size={16} />
                      </button>
                    </div>
                  ) : (
                    <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-slate-200 border-dashed rounded-2xl bg-slate-50 hover:bg-slate-100 hover:border-slate-300 transition-all cursor-pointer">
                      <ImageIcon className="text-slate-400 mb-2" size={24} />
                      <span className="text-sm font-bold text-slate-600">
                        Clique para enviar imagem
                      </span>
                      <span className="text-xs text-slate-400 mt-1">
                        Compressão inteligente automática
                      </span>
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={handleImageChange}
                      />
                    </label>
                  )}
                </div>
              </div>

              <div className="p-5 border-t border-slate-100 bg-white shrink-0">
                <button
                  onClick={handleCreatePost}
                  disabled={
                    isSubmittingPost || !newPostTitle || !newPostPetName || !newPostLocation
                  }
                  className="w-full bg-[#f08136] hover:bg-[#e66c19] text-white rounded-xl py-3.5 font-bold shadow-lg shadow-[#f08136]/30 transition-all disabled:opacity-50 disabled:shadow-none cursor-pointer flex items-center justify-center gap-2"
                >
                  {isSubmittingPost ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      <span>Publicando Anúncio...</span>
                    </>
                  ) : (
                    <span>Publicar Agora</span>
                  )}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Flyer Poster Modal */}
      <FlyerModal
        post={selectedPostForFlyer}
        isOpen={!!selectedPostForFlyer}
        onClose={() => setSelectedPostForFlyer(null)}
      />
    </div>
  );
}

function FilterChip({
  label,
  active,
  onClick
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2 rounded-full text-xs font-bold whitespace-nowrap transition-all cursor-pointer ${
        active
          ? 'bg-[#f08136] text-white shadow-xs'
          : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
      }`}
    >
      {label}
    </button>
  );
}
