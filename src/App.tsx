import React, { useState, useEffect } from 'react';
import { Post, Conversation, PublicPetRescueProfile } from './types';
import FeedTab from './components/FeedTab';
import ChatTab from './components/ChatTab';
import ProfileTab from './components/ProfileTab';
import VaccinationBooklet from './components/VaccinationBooklet';
import AuthScreen from './components/AuthScreen';
import EmergencyModal from './components/EmergencyModal';
import PetRescueModal from './components/PetRescueModal';
import { Home, MessageCircle, User as UserIcon, Syringe, LogIn, ShieldAlert } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import * as api from './lib/apiService';
import { useAuth } from './lib/AuthContext';
import toast from 'react-hot-toast';

type Tab = 'feed' | 'vaccines' | 'chat' | 'profile';

export default function App() {
  const { user, loading } = useAuth();

  const [activeTab, setActiveTab] = useState<Tab>(() => {
    const saved = localStorage.getItem('uniao_pet_active_tab');
    return (saved as Tab) || 'feed';
  });

  const [posts, setPosts] = useState<Post[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [isEmergencyModalOpen, setIsEmergencyModalOpen] = useState(false);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);

  // Public Collar QR Rescue State (#rg-pet-<id>)
  const [rescueProfile, setRescueProfile] = useState<PublicPetRescueProfile | null>(null);
  const [isRescueModalOpen, setIsRescueModalOpen] = useState(false);

  const activeChatIdRef = React.useRef(activeChatId);
  React.useEffect(() => {
    activeChatIdRef.current = activeChatId;
  }, [activeChatId]);

  // Listen for QR Code Collar Rescue Deep Link (#rg-pet-123)
  useEffect(() => {
    const checkRescueHash = async () => {
      const hash = window.location.hash || '';
      if (hash.startsWith('#rg-pet-')) {
        const petId = hash.replace('#rg-pet-', '').trim();
        if (!petId) return;
        try {
          const profile = await api.fetchPublicPetProfile(petId);
          setRescueProfile(profile);
          setIsRescueModalOpen(true);
        } catch (err: any) {
          toast.error(err?.message || 'QR Code de pet não encontrado.');
        }
      }
    };
    checkRescueHash();
    window.addEventListener('hashchange', checkRescueHash);
    return () => window.removeEventListener('hashchange', checkRescueHash);
  }, []);

  // Load public feed posts (works for both guests and logged-in users!) + user conversations
  useEffect(() => {
    const loadData = async () => {
      if (document.visibilityState === 'hidden') return;
      try {
        const fetchedPosts = await api.fetchPosts(user?.email);
        setPosts((prev) => {
          if (prev === fetchedPosts) return prev;
          if (
            prev.length === fetchedPosts.length &&
            JSON.stringify(prev) === JSON.stringify(fetchedPosts)
          ) {
            return prev;
          }
          return fetchedPosts;
        });

        if (user?.email) {
          const fetchedConvs = await api.fetchConversations(user.email);
          setConversations((prev) => {
            if (prev === fetchedConvs) return prev;
            const map = new Map<string, Conversation>();
            fetchedConvs.forEach((sc) => map.set(sc.id, sc));
            prev.forEach((lc) => {
              const existing = map.get(lc.id);
              if (!existing) {
                map.set(lc.id, lc);
              } else {
                const serverMsgs = existing.messages || [];
                const localMsgs = lc.messages || [];
                const messages = serverMsgs.length >= localMsgs.length ? serverMsgs : localMsgs;
                map.set(lc.id, { ...existing, messages });
              }
            });
            const nextArray = Array.from(map.values());
            if (
              prev.length === nextArray.length &&
              JSON.stringify(prev) === JSON.stringify(nextArray)
            ) {
              return prev;
            }
            return nextArray;
          });
        }
      } catch (error) {
        console.error('Error loading data:', error);
      }
    };

    loadData();
    const interval = setInterval(loadData, 4500);
    return () => clearInterval(interval);
  }, [user]);

  useEffect(() => {
    localStorage.setItem('uniao_pet_active_tab', activeTab);
  }, [activeTab]);

  const handleSelectTab = (tab: Tab) => {
    if (!user && tab !== 'feed') {
      setIsAuthModalOpen(true);
      return;
    }
    setActiveTab(tab);
    if (tab !== 'chat') setActiveChatId(null);
  };

  /** Start or open a chat from a feed post. */
  const handleStartChatFromPost = async (post: Post) => {
    if (!user) {
      setIsAuthModalOpen(true);
      return;
    }

    const targetEmail = post.authorEmail?.toLowerCase();
    const targetName = post.authorName?.toLowerCase();

    const existingChat = conversations.find((c) => {
      const recipientEmail = (c.recipient?.email || c.recipientEmail)?.toLowerCase();
      const recipientName = (c.recipient?.name || c.recipientName || c.title)?.toLowerCase();
      if (targetEmail && recipientEmail === targetEmail) return true;
      if (targetEmail && c.participants?.some((p) => p.toLowerCase() === targetEmail)) return true;
      if (targetName && recipientName === targetName) return true;
      return false;
    });

    if (existingChat) {
      setActiveChatId(existingChat.id);
      setActiveTab('chat');
      return;
    }

    const petEmoji =
      post.category === 'adoção' || post.category === 'adocao'
        ? '🐱'
        : post.category === 'desaparecido'
        ? '🐕'
        : '🎁';
    const newChatTitle = `${post.title.substring(0, 20)}... ${petEmoji}`;

    const newChatData = {
      title: newChatTitle,
      category: post.category,
      lastMessage: '',
      date: 'Agora',
      participants: [user.email, post.authorEmail || ''],
      recipientEmail: post.authorEmail || '',
      recipientName: post.authorName,
      recipientAvatar: post.authorAvatar,
      recipient: {
        name: post.authorName,
        email: post.authorEmail || '',
        avatar: post.authorAvatar
      }
    };

    try {
      const createdConv = await api.createConversation(newChatData);

      const openingMsg = `Olá, ${post.authorName}! Vi o seu post sobre o ${post.petName} em ${post.location} e gostaria de conversar a respeito.`;
      await api.addMessage(createdConv.id, {
        senderEmail: user.email,
        senderName: user.name,
        text: openingMsg,
        timestamp: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
      });

      const updatedConvs = await api.fetchConversations(user.email);
      setConversations(updatedConvs);
      setActiveChatId(createdConv.id);
      setActiveTab('chat');
    } catch (error) {
      console.error('Failed to start chat:', error);
    }
  };

  const handleTriggerCreatePost = () => {
    if (!user) {
      setIsAuthModalOpen(true);
      return;
    }
    setActiveTab('feed');
    setTimeout(() => {
      const headerBtn = document.getElementById('btn-new-post-header');
      if (headerBtn) headerBtn.click();
    }, 150);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center gap-3 font-bold text-slate-500">
        <div className="w-11 h-11 rounded-2xl bg-[#fdf2e9] flex items-center justify-center text-2xl animate-bounce">
          🐾
        </div>
        <span className="text-sm">Carregando UniãoPet...</span>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f8fafc] flex flex-col md:flex-row">
      {/* Desktop Sidebar */}
      <aside className="hidden md:flex md:w-64 lg:w-72 bg-white border-r border-slate-200/75 flex-col shrink-0 sticky top-0 h-screen p-6">
        <div className="flex items-center gap-3 mb-8">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-[#ff9a44] to-[#f08136] flex items-center justify-center text-white shadow-md shadow-[#f08136]/25 select-none">
            <span className="text-2xl">🐾</span>
          </div>
          <div>
            <h1 className="text-xl font-black text-slate-900 tracking-tight leading-tight">
              UniãoPet
            </h1>
            <p className="text-[10px] text-slate-400 font-extrabold tracking-widest uppercase">
              Saúde & Resgate Animal
            </p>
          </div>
        </div>

        <nav className="flex-1 space-y-1.5">
          <button
            onClick={() => handleSelectTab('feed')}
            className={`w-full flex items-center gap-3.5 px-4 py-3.5 rounded-2xl text-sm font-bold transition-all cursor-pointer ${
              activeTab === 'feed'
                ? 'bg-[#fdf2e9] text-[#f08136] shadow-2xs'
                : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800'
            }`}
          >
            <Home size={20} className={activeTab === 'feed' ? 'stroke-[2.5]' : 'stroke-[1.8]'} />
            <span>Feed & Radar</span>
          </button>

          <button
            onClick={() => handleSelectTab('vaccines')}
            className={`w-full flex items-center gap-3.5 px-4 py-3.5 rounded-2xl text-sm font-bold transition-all cursor-pointer ${
              activeTab === 'vaccines'
                ? 'bg-[#fdf2e9] text-[#f08136] shadow-2xs'
                : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800'
            }`}
          >
            <Syringe
              size={20}
              className={activeTab === 'vaccines' ? 'stroke-[2.5]' : 'stroke-[1.8]'}
            />
            <span>Caderneta & RG QR</span>
          </button>

          <button
            onClick={() => handleSelectTab('chat')}
            className={`w-full flex items-center gap-3.5 px-4 py-3.5 rounded-2xl text-sm font-bold transition-all cursor-pointer justify-between ${
              activeTab === 'chat'
                ? 'bg-[#fdf2e9] text-[#f08136] shadow-2xs'
                : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800'
            }`}
          >
            <div className="flex items-center gap-3.5">
              <MessageCircle
                size={20}
                className={activeTab === 'chat' ? 'stroke-[2.5]' : 'stroke-[1.8]'}
              />
              <span>Mensagens</span>
            </div>
            {conversations.filter((c) => c.hasUnread).length > 0 && (
              <span className="bg-[#f08136] text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[18px] text-center">
                {conversations.filter((c) => c.hasUnread).length}
              </span>
            )}
          </button>

          <button
            onClick={() => handleSelectTab('profile')}
            className={`w-full flex items-center gap-3.5 px-4 py-3.5 rounded-2xl text-sm font-bold transition-all cursor-pointer ${
              activeTab === 'profile'
                ? 'bg-[#fdf2e9] text-[#f08136] shadow-2xs'
                : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800'
            }`}
          >
            <UserIcon
              size={20}
              className={activeTab === 'profile' ? 'stroke-[2.5]' : 'stroke-[1.8]'}
            />
            <span>Meu Perfil</span>
          </button>

          {/* Emergency Vet & First-Aid Action */}
          <div className="pt-4 mt-2 border-t border-slate-100">
            <button
              onClick={() => setIsEmergencyModalOpen(true)}
              className="w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl text-xs font-black transition-all cursor-pointer bg-red-50 hover:bg-red-100 text-red-600 border border-red-200/80 shadow-2xs group"
            >
              <div className="w-8 h-8 rounded-xl bg-red-600 text-white flex items-center justify-center shrink-0 shadow-xs group-hover:scale-105 transition-transform">
                <ShieldAlert size={17} />
              </div>
              <div className="text-left min-w-0 leading-tight">
                <p className="font-extrabold text-red-700">Emergência Pet 24h</p>
                <p className="text-[10px] text-red-500 font-medium">Triagem IA & Socorros</p>
              </div>
            </button>
          </div>
        </nav>

        {/* Bottom Auth / User Profile Section */}
        <div className="pt-4 border-t border-slate-100">
          {user ? (
            <div className="flex items-center gap-3">
              <img
                src={
                  user.avatar ||
                  `https://ui-avatars.com/api/?name=${encodeURIComponent(
                    user.name
                  )}&background=f08136&color=fff`
                }
                alt={user.name}
                className="w-10 h-10 rounded-full object-cover border border-slate-200 shadow-2xs shrink-0"
                referrerPolicy="no-referrer"
              />
              <div className="min-w-0">
                <p className="text-xs font-bold text-slate-800 truncate">{user.name}</p>
                <p className="text-[10px] text-slate-400 truncate">{user.email}</p>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setIsAuthModalOpen(true)}
              className="w-full py-3 px-4 rounded-2xl bg-slate-900 hover:bg-black text-white text-xs font-extrabold flex items-center justify-center gap-2 shadow-sm transition-all cursor-pointer"
            >
              <LogIn size={15} />
              <span>Entrar ou Criar Conta</span>
            </button>
          )}
        </div>
      </aside>

      <main className="flex-1 flex flex-col min-w-0 bg-[#f8fafc] relative min-h-screen">
        {/* Mobile Top Header with Emergency Trigger */}
        <header className="md:hidden flex items-center justify-between px-4 py-3 glass-surface border-b border-slate-200/70 sticky top-0 z-30">
          <div className="flex items-center gap-2">
            <span className="text-xl">🐾</span>
            <span className="font-black text-slate-900 text-base tracking-tight">UniãoPet</span>
          </div>
          <div className="flex items-center gap-2">
            {!user && (
              <button
                onClick={() => setIsAuthModalOpen(true)}
                className="px-3 py-1.5 rounded-full bg-slate-900 text-white text-xs font-extrabold cursor-pointer"
              >
                Entrar
              </button>
            )}
            <button
              onClick={() => setIsEmergencyModalOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-red-50 border border-red-200 text-red-600 text-xs font-black shadow-2xs cursor-pointer active:scale-95 transition-all"
            >
              <span>🚨</span>
              <span>Emergência</span>
            </button>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto">
          <AnimatePresence mode="wait">
            {activeTab === 'feed' && (
              <motion.div
                key="feed-tab"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.16 }}
              >
                <FeedTab
                  posts={posts}
                  setPosts={setPosts}
                  onStartChat={handleStartChatFromPost}
                  currentUser={user}
                  onRequireAuth={() => setIsAuthModalOpen(true)}
                />
              </motion.div>
            )}

            {activeTab === 'vaccines' && user && (
              <motion.div
                key="vaccines-tab"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.16 }}
              >
                <VaccinationBooklet currentUser={user} />
              </motion.div>
            )}

            {activeTab === 'chat' && user && (
              <motion.div
                key="chat-tab"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.16 }}
                className="h-full"
              >
                <ChatTab
                  conversations={conversations}
                  setConversations={setConversations}
                  activeChatId={activeChatId}
                  setActiveChatId={setActiveChatId}
                  currentUser={user}
                />
              </motion.div>
            )}

            {activeTab === 'profile' && user && (
              <motion.div
                key="profile-tab"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.16 }}
              >
                <ProfileTab
                  posts={posts}
                  setPosts={setPosts}
                  onStartCreatePost={handleTriggerCreatePost}
                  onOpenVaccines={() => {
                    setActiveTab('vaccines');
                    setActiveChatId(null);
                  }}
                />
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Mobile Bottom Nav */}
        <div className="md:hidden sticky bottom-0 glass-surface border-t border-slate-200/80 px-6 py-2.5 flex justify-between items-center z-40 shadow-[0_-4px_24px_rgba(15,23,42,0.04)] rounded-t-3xl">
          <button
            onClick={() => handleSelectTab('feed')}
            className={`flex flex-col items-center gap-1 flex-1 py-1 transition-all cursor-pointer ${
              activeTab === 'feed'
                ? 'text-[#f08136] scale-105'
                : 'text-slate-400 hover:text-slate-600'
            }`}
          >
            <Home size={22} className={activeTab === 'feed' ? 'stroke-[2.5]' : 'stroke-[1.8]'} />
            <span className="text-[10px] font-bold tracking-wide">Feed</span>
          </button>

          <button
            onClick={() => handleSelectTab('vaccines')}
            className={`flex flex-col items-center gap-1 flex-1 py-1 transition-all cursor-pointer ${
              activeTab === 'vaccines'
                ? 'text-[#f08136] scale-105'
                : 'text-slate-400 hover:text-slate-600'
            }`}
          >
            <Syringe
              size={22}
              className={activeTab === 'vaccines' ? 'stroke-[2.5]' : 'stroke-[1.8]'}
            />
            <span className="text-[10px] font-bold tracking-wide">Caderneta</span>
          </button>

          <button
            onClick={() => handleSelectTab('chat')}
            className={`flex flex-col items-center gap-1 flex-1 py-1 transition-all cursor-pointer ${
              activeTab === 'chat'
                ? 'text-[#f08136] scale-105'
                : 'text-slate-400 hover:text-slate-600'
            }`}
          >
            <div className="relative">
              <MessageCircle
                size={22}
                className={activeTab === 'chat' ? 'stroke-[2.5]' : 'stroke-[1.8]'}
              />
              {conversations.filter((c) => c.hasUnread).length > 0 && (
                <span className="absolute -top-1 -right-2 bg-[#f08136] text-white text-[9px] font-bold w-4 h-4 rounded-full flex items-center justify-center">
                  {conversations.filter((c) => c.hasUnread).length > 9
                    ? '9+'
                    : conversations.filter((c) => c.hasUnread).length}
                </span>
              )}
            </div>
            <span className="text-[10px] font-bold tracking-wide">Chat</span>
          </button>

          <button
            onClick={() => handleSelectTab('profile')}
            className={`flex flex-col items-center gap-1 flex-1 py-1 transition-all cursor-pointer ${
              activeTab === 'profile'
                ? 'text-[#f08136] scale-105'
                : 'text-slate-400 hover:text-slate-600'
            }`}
          >
            <UserIcon
              size={22}
              className={activeTab === 'profile' ? 'stroke-[2.5]' : 'stroke-[1.8]'}
            />
            <span className="text-[10px] font-bold tracking-wide">
              {user ? 'Perfil' : 'Entrar'}
            </span>
          </button>
        </div>

        {/* Emergency Vet & First-Aid Center Modal */}
        <EmergencyModal
          userEmail={user?.email}
          isOpen={isEmergencyModalOpen}
          onClose={() => setIsEmergencyModalOpen(false)}
        />

        {/* Public Pet Collar QR Rescue Modal (#rg-pet-...) */}
        <PetRescueModal
          isOpen={isRescueModalOpen}
          onClose={() => {
            setIsRescueModalOpen(false);
            if (window.location.hash.startsWith('#rg-pet-')) {
              history.replaceState(null, '', window.location.pathname + window.location.search);
            }
          }}
          publicProfile={rescueProfile}
          isPublicRescueMode={true}
        />

        {/* Auth Modal when guest triggers a protected action */}
        <AnimatePresence>
          {isAuthModalOpen && !user && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/60 backdrop-blur-sm"
            >
              <AuthScreen onClose={() => setIsAuthModalOpen(false)} />
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}
