import React, { useState, useEffect } from 'react';
import { Post, PostCategory, PetRecord } from '../types';
import { Edit2, LogOut, Trash2, Heart, MessageSquare, Plus, Save, Camera, Syringe, ChevronRight, Download, Upload, Database } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import * as api from '../lib/apiService';
import { useAuth } from '../lib/AuthContext';
import toast from 'react-hot-toast';
import { compressImageFile } from '../lib/imageCompressor';

interface ProfileTabProps {
  posts: Post[];
  setPosts: React.Dispatch<React.SetStateAction<Post[]>>;
  onStartCreatePost: () => void;
  onOpenVaccines?: () => void;
}

export default function ProfileTab({ posts, setPosts, onStartCreatePost, onOpenVaccines }: ProfileTabProps) {
  const { user, logout, updateProfile } = useAuth();
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(user?.name || '');
  const [editAvatar, setEditAvatar] = useState(user?.avatar || '');
  const [editPhone, setEditPhone] = useState(user?.phone || '');
  const [editBio, setEditBio] = useState(user?.bio || '');
  const [saving, setSaving] = useState(false);
  const [userPets, setUserPets] = useState<PetRecord[]>([]);

  const [activeFilter, setActiveFilter] = useState<PostCategory | 'todos'>('todos');

  // Sync edit state with current user
  useEffect(() => {
    if (user) {
      setEditName(user.name);
      setEditAvatar(user.avatar || '');
      setEditPhone(user.phone || '');
      setEditBio(user.bio || '');

      // Load user pets summary
      api.fetchPets(user.email).then(setUserPets).catch(() => {});
    }
  }, [user]);

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      try {
        const compressed = await compressImageFile(file, { maxWidth: 400, maxHeight: 400, quality: 0.8 });
        setEditAvatar(compressed);
      } catch (err: any) {
        toast.error(err?.message || 'Erro ao processar imagem');
      }
    }
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editName.trim()) {
      toast.error('O nome não pode estar vazio.');
      return;
    }
    setSaving(true);
    try {
      await updateProfile({
        name: editName.trim(),
        avatar: editAvatar,
        phone: editPhone.trim(),
        bio: editBio.trim()
      });
      setIsEditing(false);
    } catch (err) {
      // toast handled in AuthContext
    } finally {
      setSaving(false);
    }
  };


  // Filter only current user's posts — prefer authorEmail over authorName for accuracy
  const userPosts = posts.filter(post =>
    post.authorEmail
      ? post.authorEmail === user?.email
      : post.authorName === user?.name
  );

  // Calculate live stats
  const totalPosts = userPosts.length;
  const totalPerdidos = userPosts.filter(p => p.category === 'desaparecido').length;
  const totalAdocao = userPosts.filter(p => p.category === 'adoção').length;
  const totalDoacao = userPosts.filter(p => p.category === 'doação').length;

  // Filter posts based on local filter
  const displayedPosts = userPosts.filter(post => 
    activeFilter === 'todos' || post.category === activeFilter
  );

  // Delete post handler — passes userEmail for server authorization
  const handleDeletePost = async (postId: string) => {
    if (confirm('Tem certeza que deseja remover esta publicação?')) {
      try {
        await api.deletePost(postId, user?.email);
        setPosts(prev => prev.filter(p => p.id !== postId));
        toast.success('Publicação removida com sucesso.');
      } catch (err) {
        console.error('Failed to delete post:', err);
        toast.error('Erro ao remover publicação.');
      }
    }
  };

  if (!user) return null;


  return (
    <div className="pb-24 max-w-4xl mx-auto px-4 pt-5">
      {/* Header exactly like screenshot */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-800">Perfil</h1>
        <button 
          onClick={logout}
          title="Sair"
          className="p-2 bg-gray-100 hover:bg-red-50 hover:text-red-500 rounded-full text-gray-500 transition-all cursor-pointer flex items-center justify-center"
        >
          <LogOut size={18} />
        </button>
      </div>

      {/* Main card matching screenshot */}
      <div className="bg-white rounded-3xl border border-gray-100 p-5 shadow-xs mb-6 relative">
        <div className="flex items-start gap-5">
          {/* User info */}
          <div className="flex-1 min-w-0">
            {isEditing ? (
              <form onSubmit={handleSaveProfile} className="space-y-3">
                <div className="flex items-center gap-4 pb-2">
                  <div className="relative w-16 h-16 rounded-full overflow-hidden border-2 border-dashed border-[#f08136] bg-gray-50 flex items-center justify-center shrink-0">
                    <img
                      src={editAvatar || user.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(editName || 'User')}`}
                      alt={editName}
                      className="w-full h-full object-cover"
                    />
                    <label className="absolute inset-0 bg-black/40 flex items-center justify-center text-white opacity-0 hover:opacity-100 transition-opacity cursor-pointer">
                      <Camera size={18} />
                      <input type="file" accept="image/*" className="hidden" onChange={handleAvatarChange} />
                    </label>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-700 uppercase tracking-wide">
                      Foto de Perfil
                    </label>
                    <label className="inline-block mt-1 px-3 py-1 bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-bold rounded-lg cursor-pointer transition-colors">
                      Escolher Foto
                      <input type="file" accept="image/*" className="hidden" onChange={handleAvatarChange} />
                    </label>
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-gray-600 uppercase tracking-wider">Nome Completo</label>
                  <input
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="w-full px-3 py-2 text-sm font-semibold text-gray-800 bg-gray-50 border border-gray-200 rounded-xl focus:bg-white focus:border-[#f08136] focus:outline-none transition-all"
                    required
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-bold text-gray-600 uppercase tracking-wider">WhatsApp / Telefone</label>
                    <input
                      type="text"
                      placeholder="(11) 99999-9999"
                      value={editPhone}
                      onChange={(e) => setEditPhone(e.target.value)}
                      className="w-full px-3 py-2 text-xs text-gray-700 bg-gray-50 border border-gray-200 rounded-xl focus:bg-white focus:border-[#f08136] focus:outline-none transition-all"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-gray-600 uppercase tracking-wider">Bio / Descrição</label>
                    <input
                      type="text"
                      placeholder="Amante dos animais, tutor..."
                      value={editBio}
                      onChange={(e) => setEditBio(e.target.value)}
                      className="w-full px-3 py-2 text-xs text-gray-700 bg-gray-50 border border-gray-200 rounded-xl focus:bg-white focus:border-[#f08136] focus:outline-none transition-all"
                    />
                  </div>
                </div>

                <div className="flex gap-2 pt-2">
                  <button 
                    type="submit" 
                    disabled={saving}
                    className="flex items-center gap-1.5 bg-[#f08136] hover:bg-[#e07126] text-white text-xs font-bold px-4 py-2 rounded-xl transition-all shadow-xs cursor-pointer disabled:opacity-50"
                  >
                    <Save size={14} /> {saving ? 'Salvando...' : 'Salvar Alterações'}
                  </button>
                  <button 
                    type="button" 
                    onClick={() => setIsEditing(false)}
                    className="bg-gray-100 hover:bg-gray-200 text-gray-600 text-xs font-bold px-4 py-2 rounded-xl transition-all cursor-pointer"
                  >
                    Cancelar
                  </button>
                </div>
              </form>
            ) : (
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <img
                    src={user.avatar || 'https://ui-avatars.com/api/?name=' + encodeURIComponent(user.name) + '&background=f08136&color=fff'}
                    alt={user.name}
                    className="w-16 h-16 rounded-2xl object-cover shadow-sm border border-gray-150"
                  />
                  <div>
                    <h2 className="text-lg font-extrabold text-gray-800 leading-tight">{user.name}</h2>
                    <p className="text-xs text-gray-400 font-medium">{user.email}</p>
                    {user.phone && (
                      <p className="text-xs text-emerald-600 font-bold mt-0.5">📞 {user.phone}</p>
                    )}
                    {user.bio && (
                      <p className="text-xs text-gray-600 italic mt-1">{user.bio}</p>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => setIsEditing(true)}
                  className="text-gray-400 hover:text-[#f08136] p-2 rounded-xl hover:bg-gray-50 transition-all cursor-pointer"
                  title="Editar Perfil"
                >
                  <Edit2 size={18} />
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Caderneta Pet Shortcut Card */}
      <div className="bg-gradient-to-r from-amber-50 to-orange-50 border border-orange-200/80 rounded-3xl p-5 shadow-2xs mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-2xl bg-[#f08136] text-white flex items-center justify-center shadow-md shadow-[#f08136]/20 shrink-0">
            <Syringe size={22} className="stroke-[2.5]" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-extrabold text-gray-800 text-sm">Caderneta de Vacinação Pet</h3>
              <span className="bg-[#f08136] text-white text-[10px] font-black px-2 py-0.5 rounded-full uppercase">
                {userPets.length} {userPets.length === 1 ? 'Pet' : 'Pets'}
              </span>
            </div>
            <p className="text-xs text-gray-600 mt-0.5">
              Gerencie vacinas, reforços e a carteirinha de saúde oficial dos seus animais.
            </p>
          </div>
        </div>

        {onOpenVaccines && (
          <button
            onClick={onOpenVaccines}
            className="inline-flex items-center gap-1.5 px-4 py-2.5 bg-white hover:bg-orange-100/50 text-[#f08136] border border-orange-200 text-xs font-black rounded-xl transition-all shadow-2xs active:scale-95 cursor-pointer whitespace-nowrap self-start sm:self-auto"
          >
            <span>Abrir Caderneta</span>
            <ChevronRight size={14} />
          </button>
        )}
      </div>


      {/* Stats Row Cards exactly matching screenshot */}
      <div className="grid grid-cols-4 gap-2 mb-6">
        <div className="bg-white rounded-2xl border border-gray-100 p-3 text-center shadow-2xs hover:shadow-xs transition-all">
          <p className="text-xl font-bold text-gray-800">{totalPosts}</p>
          <p className="text-[10px] text-gray-400 font-bold uppercase mt-1">Posts</p>
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 p-3 text-center shadow-2xs hover:shadow-xs transition-all">
          <p className="text-xl font-bold text-red-500">{totalPerdidos}</p>
          <p className="text-[10px] text-gray-400 font-bold uppercase mt-1">Perdidos</p>
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 p-3 text-center shadow-2xs hover:shadow-xs transition-all">
          <p className="text-xl font-bold text-[#2cb396]">{totalAdocao}</p>
          <p className="text-[10px] text-gray-400 font-bold uppercase mt-1">Adoção</p>
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 p-3 text-center shadow-2xs hover:shadow-xs transition-all">
          <p className="text-xl font-bold text-blue-500">{totalDoacao}</p>
          <p className="text-[10px] text-gray-400 font-bold uppercase mt-1">Doação</p>
        </div>
      </div>

      {/* Filter pills below stats */}
      <div className="flex gap-2 overflow-x-auto scrollbar-none mb-4">
        <button
          onClick={() => setActiveFilter('todos')}
          className={`px-4 py-2 rounded-full text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
            activeFilter === 'todos' ? 'bg-[#f08136] text-white shadow-sm' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
          }`}
        >
          Todos
        </button>
        <button
          onClick={() => setActiveFilter('desaparecido')}
          className={`px-4 py-2 rounded-full text-xs font-semibold whitespace-nowrap transition-all flex items-center gap-1 cursor-pointer ${
            activeFilter === 'desaparecido' ? 'bg-[#f08136] text-white shadow-sm' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
          }`}
        >
          🔍 Perdidos
        </button>
        <button
          onClick={() => setActiveFilter('adoção')}
          className={`px-4 py-2 rounded-full text-xs font-semibold whitespace-nowrap transition-all flex items-center gap-1 cursor-pointer ${
            activeFilter === 'adoção' ? 'bg-[#f08136] text-white shadow-sm' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
          }`}
        >
          💛 Adoção
        </button>
        <button
          onClick={() => setActiveFilter('doação')}
          className={`px-4 py-2 rounded-full text-xs font-semibold whitespace-nowrap transition-all flex items-center gap-1 cursor-pointer ${
            activeFilter === 'doação' ? 'bg-[#f08136] text-white shadow-sm' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
          }`}
        >
          🎁 Doação
        </button>
      </div>

      {/* Big Orange Button "+ Nova Publicação" */}
      <button
        onClick={onStartCreatePost}
        className="w-full bg-[#f08136] text-white hover:bg-[#e07126] active:scale-98 font-bold py-3.5 rounded-2xl text-sm transition-all shadow-md mb-6 flex items-center justify-center gap-2 cursor-pointer"
        id="btn-new-post-profile"
      >
        <Plus size={18} />
        <span>+ Nova Publicação</span>
      </button>

      {/* Segurança e Portabilidade de Dados (Backup / Restore 1-Clique) */}
      <div className="bg-white rounded-3xl border border-slate-200/80 p-5 shadow-2xs mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-2xl bg-slate-900 text-white flex items-center justify-center shrink-0">
            <Database size={20} className="text-[#f08136]" />
          </div>
          <div>
            <h3 className="font-extrabold text-slate-800 text-sm">Segurança e Backup de Dados</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Exporte uma cópia completa (.json) ou restaure dados entre servidores com 1 clique.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap shrink-0">
          <button
            type="button"
            onClick={async () => {
              try {
                await api.downloadBackup();
                toast.success('Backup baixado com sucesso!');
              } catch (err: any) {
                toast.error(err?.message || 'Erro ao baixar backup.');
              }
            }}
            className="inline-flex items-center gap-1.5 px-3.5 py-2.5 bg-slate-900 hover:bg-black text-white text-xs font-bold rounded-xl transition-all shadow-2xs cursor-pointer"
          >
            <Download size={14} />
            <span>Baixar Backup (.json)</span>
          </button>

          <label className="inline-flex items-center gap-1.5 px-3.5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition-all cursor-pointer">
            <Upload size={14} />
            <span>Restaurar JSON</span>
            <input
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                try {
                  const text = await file.text();
                  const parsed = JSON.parse(text);
                  if (!confirm('Deseja restaurar este backup no banco de dados atual?')) return;
                  const res = await api.restoreDatabase(parsed);
                  toast.success(res.message || 'Backup restaurado com sucesso!');
                  const freshPosts = await api.fetchPosts(user.email, true);
                  setPosts(freshPosts);
                } catch (err: any) {
                  toast.error(err?.message || 'Arquivo de backup inválido.');
                } finally {
                  e.target.value = '';
                }
              }}
            />
          </label>
        </div>
      </div>

      {/* List of user's own posts with edit/delete options */}
      <div className="space-y-4">
        <h3 className="font-bold text-gray-800 text-sm border-b border-gray-100 pb-2">Minhas Publicações ({displayedPosts.length})</h3>
        
        {displayedPosts.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {displayedPosts.map(post => (
              <div 
                key={post.id}
                className="bg-white rounded-2xl border border-gray-100 overflow-hidden flex shadow-2xs hover:shadow-xs transition-all relative"
              >
                {/* Image thumb */}
                <div className="w-24 h-24 bg-gray-50 shrink-0">
                  <img src={post.imageUrl} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                </div>

                {/* Post details */}
                <div className="p-3 flex-1 min-w-0 flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between gap-2 mb-0.5">
                      <span className="text-[9px] font-bold text-[#f08136] uppercase">
                        {post.category}
                      </span>
                      <span className="text-[10px] text-gray-400 font-medium">
                        {post.date}
                      </span>
                    </div>
                    <h4 className="font-bold text-gray-800 text-sm truncate leading-tight">
                      {post.title}
                    </h4>
                    <p className="text-[11px] text-gray-500 line-clamp-1 mt-1">
                      {post.description}
                    </p>
                  </div>

                  <div className="flex items-center justify-between pt-1">
                    <div className="flex gap-3 text-xs text-gray-400">
                      <span className="flex items-center gap-0.5">
                        <Heart size={12} className="text-red-400" fill="currentColor" /> {post.likes}
                      </span>
                      <span className="flex items-center gap-0.5">
                        <MessageSquare size={12} className="text-gray-400" /> {post.comments.length}
                      </span>
                    </div>

                    <button
                      onClick={() => handleDeletePost(post.id)}
                      className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg transition-all cursor-pointer"
                      title="Excluir post"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-12 px-4 bg-gray-50 rounded-2xl border border-dashed border-gray-200">
            <p className="text-gray-500 text-xs font-medium">Você não possui publicações criadas nesta categoria.</p>
            <button 
              onClick={onStartCreatePost}
              className="mt-2 text-xs text-[#f08136] font-semibold underline cursor-pointer"
            >
              Criar minha primeira publicação agora!
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
