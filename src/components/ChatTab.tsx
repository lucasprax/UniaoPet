import React, { useState, useEffect, useRef } from 'react';
import { Conversation, Message, PostCategory, UserProfile, Post } from '../types';
import { MessageCircle, Send, ArrowLeft, Plus, X, Search, Image as ImageIcon, Share2, UserPlus, UserCheck, Share, User, Trash2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import * as api from '../lib/apiService';
import { formatRelativeTime, formatUserPresence } from '../lib/dateUtils';
import toast from 'react-hot-toast';
import { compressImageFile } from '../lib/imageCompressor';

interface ChatTabProps {
  conversations: Conversation[];
  setConversations: React.Dispatch<React.SetStateAction<Conversation[]>>;
  activeChatId: string | null;
  setActiveChatId: React.Dispatch<React.SetStateAction<string | null>>;
  currentUser: UserProfile;
}

export default function ChatTab({
  conversations,
  setConversations,
  activeChatId,
  setActiveChatId,
  currentUser
}: ChatTabProps) {
  const [newMessage, setNewMessage] = useState('');
  const [showNewChatModal, setShowNewChatModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // User Search State
  const [userSearchQuery, setUserSearchQuery] = useState('');

  // Profile & Actions
  const [showProfile, setShowProfile] = useState<UserProfile | null>(null);
  const [following, setFollowing] = useState<Record<string, boolean>>({});

  // Share Post Modal
  const [showSharePostModal, setShowSharePostModal] = useState(false);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [feedPosts, setFeedPosts] = useState<Post[]>([]);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const activeChat = conversations.find(c => c.id === activeChatId);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [activeChat?.messages]);

  // Load users and following data on mount (scoped to currentUser)
  useEffect(() => {
    const loadData = async () => {
      try {
        const [usersData, followingData, postsData] = await Promise.all([
          api.fetchUsers(),
          api.getFollowing(currentUser.email),
          api.fetchPosts(currentUser.email)
        ]);

        // Exclude current user from the list
        setUsers(usersData.filter(u => u.email !== currentUser.email));

        const followingMap: Record<string, boolean> = {};
        followingData.forEach(f => { followingMap[f.target] = true; });
        setFollowing(followingMap);

        setFeedPosts(postsData);
      } catch (err) {
        console.error('Error loading chat data:', err);
      }
    };
    loadData();
  }, [currentUser.email]);

  // When the user opens a conversation, mark it as read
  useEffect(() => {
    if (activeChatId) {
      api.markConversationAsRead(activeChatId, currentUser.email).catch(() => {});
      // Clear unread flag in local state immediately (optimistic)
      setConversations(prev =>
        prev.map(c => c.id === activeChatId ? { ...c, hasUnread: false } : c)
      );
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeChatId]);



  /**
   * Resolve if a message was sent by the current user.
   * Uses senderEmail (DB truth) when available, falls back to legacy 'me'/'other'.
   */
  const isMyMessage = (msg: Message): boolean => {
    if (msg.senderEmail) return msg.senderEmail === currentUser.email;
    return msg.sender === 'me';
  };

  const toggleFollow = async (email: string) => {
    const isCurrentlyFollowing = !!following[email];
    try {
      await api.toggleFollow(currentUser.email, email, !isCurrentlyFollowing);
      setFollowing(prev => ({ ...prev, [email]: !isCurrentlyFollowing }));
      toast.success(!isCurrentlyFollowing ? 'Você começou a seguir!' : 'Você deixou de seguir');
    } catch (error) {
      toast.error('Erro ao atualizar ação.');
    }
  };

  const handleDeleteConversation = async (convId: string, convName: string, e: React.MouseEvent) => {
    e.stopPropagation(); // prevent opening the conversation
    if (!window.confirm(`Apagar conversa com "${convName}"? Esta ação não pode ser desfeita.`)) return;
    try {
      await api.deleteConversation(convId, currentUser.email);
      setConversations(prev => prev.filter(c => c.id !== convId));
      if (activeChatId === convId) setActiveChatId(null);
      toast.success('Conversa apagada.');
    } catch (error) {
      toast.error('Erro ao apagar conversa.');
    }
  };

  const handleSendMessage = async (e?: React.FormEvent, customMsg?: Partial<Omit<Message, 'id' | 'sender'>>) => {
    if (e) e.preventDefault();

    const isMedia = !!customMsg?.imageUrl;
    const isPost = !!customMsg?.sharedPost;
    const textToSend = customMsg?.text !== undefined ? customMsg.text : newMessage;

    if (!textToSend.trim() && !isMedia && !isPost) return;
    if (!activeChatId) return;

    // Clear input BEFORE the async call so the chat view stays open
    if (!customMsg) setNewMessage('');

    const msgPayload: Omit<Message, 'id' | 'sender'> = {
      senderEmail: currentUser.email,
      senderName: currentUser.name,
      text: textToSend,
      timestamp: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
      ...customMsg
    };

    // Capture activeChatId now to avoid stale closure issues
    const chatId = activeChatId;

    // Optimistic UI update — add the message immediately
    const tempId = `temp-${Date.now()}`;
    const optimisticMsg: Message = { ...msgPayload, id: tempId, sender: 'me' };
    setConversations(prev =>
      prev.map(chat => {
        if (chat.id !== chatId) return chat;
        return {
          ...chat,
          lastMessage: isMedia ? '📷 Imagem' : isPost ? '🔗 Publicação' : textToSend,
          date: 'Agora',
          messages: [...chat.messages, optimisticMsg]
        };
      })
    );

    try {
      const createdMsg = await api.addMessage(chatId, msgPayload);
      // Replace temp message with confirmed server message
      setConversations(prev =>
        prev.map(chat => {
          if (chat.id !== chatId) return chat;
          return {
            ...chat,
            messages: chat.messages.map(m =>
              m.id === tempId
                ? { ...createdMsg, sender: 'me' as const }
                : m
            )
          };
        })
      );
    } catch (error) {
      // Rollback optimistic update on error
      setConversations(prev =>
        prev.map(chat => {
          if (chat.id !== chatId) return chat;
          return { ...chat, messages: chat.messages.filter(m => m.id !== tempId) };
        })
      );
      toast.error('Erro ao enviar mensagem');
    }
  };

  const handleSendMedia = () => fileInputRef.current?.click();

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      try {
        const compressed = await compressImageFile(file, { maxWidth: 1000, maxHeight: 1000, quality: 0.75 });
        handleSendMessage(undefined, { text: '', imageUrl: compressed });
        toast.success('Mídia enviada!');
      } catch (err: any) {
        toast.error(err?.message || 'Erro ao enviar imagem');
      }
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleSharePost = (post: Post) => {
    handleSendMessage(undefined, {
      text: 'Dê uma olhada nesta publicação:',
      sharedPost: post
    });
    setShowSharePostModal(false);
    toast.success('Publicação compartilhada!');
  };

  const handleStartChatWithUser = async (user: UserProfile) => {
    const targetEmail = user.email?.toLowerCase();
    const targetName = user.name?.toLowerCase();

    // Check if conversation with this user already exists (by email, participant array, or name)
    const existing = conversations.find(c => {
      const recipientEmail = (c.recipient?.email || c.recipientEmail)?.toLowerCase();
      const recipientName = (c.recipient?.name || c.recipientName || c.title)?.toLowerCase();
      if (targetEmail && recipientEmail === targetEmail) return true;
      if (targetEmail && c.participants?.some(p => p.toLowerCase() === targetEmail)) return true;
      if (targetName && recipientName === targetName) return true;
      return false;
    });

    if (existing) {
      setActiveChatId(existing.id);
      setShowNewChatModal(false);
      setUserSearchQuery('');
      return;
    }

    const newChatData: Omit<Conversation, 'id' | 'messages'> = {
      title: user.name,
      category: 'geral' as PostCategory,
      lastMessage: '',
      date: 'Agora',
      participants: [currentUser.email, user.email],
      recipientEmail: user.email,
      recipientName: user.name,
      recipientAvatar: user.avatar,
      recipient: user
    };

    try {
      const createdConv = await api.createConversation(newChatData);
      setConversations(prev => [{ ...createdConv, recipient: user, messages: [] }, ...prev]);
      setActiveChatId(createdConv.id);
    } catch (error) {
      toast.error('Erro ao criar conversa');
    }

    setShowNewChatModal(false);
    setUserSearchQuery('');
  };

  const filteredConversations = conversations.filter(c => {
    const qLower = searchQuery.toLowerCase().trim();
    if (!qLower) return true;
    const name = c.recipient?.name || c.recipientName || c.title;
    return (
      name.toLowerCase().includes(qLower) ||
      c.lastMessage.toLowerCase().includes(qLower)
    );
  });

  const searchLower = userSearchQuery.toLowerCase().trim();
  const filteredUsers = users.filter(
    u =>
      u.name.toLowerCase().includes(searchLower) ||
      u.email.toLowerCase().includes(searchLower)
  );

  return (
    <div className="flex h-screen md:h-full overflow-hidden bg-white relative">

      {/* Sidebar — conversation list */}
      <div className={`w-full md:w-[380px] lg:w-[420px] flex flex-col border-r border-gray-100 bg-white transition-all duration-300 absolute md:relative z-10 h-full ${activeChatId ? '-translate-x-full md:translate-x-0' : 'translate-x-0'}`}>

        <div className="p-6 border-b border-gray-50 shrink-0">
          <div className="flex items-center justify-between mb-6">
            <h1 className="text-2xl font-extrabold text-gray-800 tracking-tight">Mensagens</h1>
            <button
              onClick={() => setShowNewChatModal(true)}
              className="p-2.5 bg-gray-50 hover:bg-[#fdf2e9] hover:text-[#f08136] rounded-xl text-gray-600 transition-all cursor-pointer shadow-xs"
              title="Nova Mensagem"
            >
              <Plus size={20} />
            </button>
          </div>

          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
            <input
              type="text"
              placeholder="Buscar mensagens..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full bg-gray-50/80 border border-gray-100 rounded-2xl py-3.5 pl-11 pr-4 text-sm focus:outline-none focus:border-[#f08136] focus:ring-1 focus:ring-[#f08136] focus:bg-white transition-all"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto divide-y divide-gray-50">
          {filteredConversations.length > 0 ? (
            filteredConversations.map(chat => {
              const displayName = chat.recipient?.name || chat.recipientName || chat.title;
              const displayAvatar = chat.recipient?.avatar || (chat.recipient as any)?.avatar || chat.recipientAvatar;
              const isActive = activeChatId === chat.id;
              const hasUnread = chat.hasUnread && !isActive;
              return (
                <div
                  key={chat.id}
                  className={`group relative flex items-center hover:bg-gray-50/70 transition-all ${
                    isActive ? 'bg-orange-50/40 md:bg-[#fdf2e9]/40' : ''
                  }`}
                >
                  {/* Main clickable area */}
                  <button
                    type="button"
                    onClick={() => setActiveChatId(chat.id)}
                    className="flex-1 px-6 py-4 flex items-center gap-4 text-left active:bg-gray-100/50 cursor-pointer min-w-0"
                  >
                    <div className="w-12 h-12 rounded-2xl bg-gray-100 overflow-hidden flex items-center justify-center shrink-0 shadow-2xs relative">
                      {displayAvatar ? (
                        <img src={displayAvatar} alt={displayName} className="w-full h-full object-cover" />
                      ) : (
                        <User className="text-gray-400" size={24} />
                      )}
                      {/* Unread notification dot */}
                      {hasUnread && (
                        <div className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-[#f08136] rounded-full border-2 border-white" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0 pr-2">
                      <div className="flex justify-between items-baseline mb-1">
                        <h3 className={`text-sm truncate ${
                          hasUnread ? 'font-extrabold text-gray-900' : 'font-bold text-gray-800'
                        }`}>{displayName}</h3>
                        <span className={`text-[10px] font-semibold whitespace-nowrap ml-2 ${
                          hasUnread ? 'text-[#f08136]' : 'text-gray-400'
                        }`}>{formatRelativeTime(chat.date)}</span>
                      </div>
                      <p className={`text-xs truncate leading-relaxed ${
                        hasUnread ? 'text-gray-700 font-semibold' : 'text-gray-500'
                      }`}>{chat.lastMessage || 'Nova conversa'}</p>
                    </div>
                  </button>

                  {/* Delete button — appears on hover */}
                  <button
                    type="button"
                    onClick={(e) => handleDeleteConversation(chat.id, displayName, e)}
                    className="opacity-0 group-hover:opacity-100 mr-3 p-2 rounded-xl text-gray-400 hover:text-red-500 hover:bg-red-50 transition-all shrink-0"
                    title="Apagar conversa"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              );
            })

          ) : (
            <div className="flex flex-col items-center justify-center h-full px-6 text-center text-gray-500">
              <MessageCircle size={32} className="text-gray-300 mb-4" />
              <h3 className="text-sm font-bold text-gray-700 mb-1">Nenhuma conversa</h3>
              <p className="text-xs">Clique em <strong>+</strong> para iniciar uma conversa.</p>
            </div>
          )}
        </div>
      </div>

      {/* Main Chat Area */}
      <div className={`flex-1 flex flex-col bg-[#fafbfc] transition-all duration-300 absolute md:relative w-full h-full z-20 ${activeChatId ? 'translate-x-0' : 'translate-x-full md:translate-x-0'}`}>
        {activeChat ? (
          <>
            {/* Chat Header */}
            <div className="p-4 md:px-6 md:py-4 border-b border-gray-100 bg-white flex items-center justify-between shrink-0 shadow-[0_4px_20px_rgb(0,0,0,0.02)] z-10">
              <div className="flex items-center gap-4 min-w-0">
                <button
                  onClick={() => setActiveChatId(null)}
                  className="md:hidden p-2 -ml-2 bg-gray-50 rounded-full text-gray-600 hover:bg-gray-100 transition-colors"
                >
                  <ArrowLeft size={20} />
                </button>

                <button
                  onClick={() => (activeChat.recipient || activeChat.recipientName) && setShowProfile(activeChat.recipient || {
                    name: activeChat.recipientName || activeChat.title,
                    email: activeChat.recipientEmail || '',
                    avatar: activeChat.recipientAvatar
                  })}
                  className="w-11 h-11 rounded-2xl bg-gray-100 overflow-hidden flex items-center justify-center shadow-2xs shrink-0 cursor-pointer hover:opacity-80 transition-opacity"
                >
                  {(activeChat.recipient?.avatar || activeChat.recipientAvatar) ? (
                    <img
                      src={activeChat.recipient?.avatar || activeChat.recipientAvatar}
                      alt={activeChat.recipient?.name || activeChat.recipientName}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <User className="text-gray-400" size={24} />
                  )}
                </button>

                <div
                  className="flex-1 min-w-0 cursor-pointer"
                  onClick={() => (activeChat.recipient || activeChat.recipientName) && setShowProfile(activeChat.recipient || {
                    name: activeChat.recipientName || activeChat.title,
                    email: activeChat.recipientEmail || '',
                    avatar: activeChat.recipientAvatar
                  })}
                >
                  <h2 className="font-bold text-gray-800 text-base leading-tight truncate hover:text-[#f08136] transition-colors">
                    {activeChat.recipient?.name || activeChat.recipientName || activeChat.title}
                  </h2>
                  {(() => {
                    const recipientEmail = activeChat.recipient?.email || activeChat.recipientEmail;
                    const recipientUser = users.find(u => u.email === recipientEmail) || activeChat.recipient;
                    const presence = formatUserPresence(recipientUser?.lastSeen);
                    return (
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <div className={`w-1.5 h-1.5 rounded-full ${presence.isOnline ? 'bg-emerald-500' : 'bg-gray-300'}`} />
                        <p className={`text-xs font-medium tracking-wide ${presence.isOnline ? 'text-emerald-600' : 'text-gray-400'}`}>
                          {presence.text}
                        </p>
                      </div>
                    );
                  })()}
                </div>
              </div>

              {/* Action Buttons */}
              {(activeChat.recipient || activeChat.recipientEmail) && (
                <div className="flex items-center gap-2 ml-4">
                  <button
                    onClick={() => toggleFollow((activeChat.recipient?.email || activeChat.recipientEmail)!)}
                    className={`p-2 rounded-xl transition-all ${
                      following[activeChat.recipient?.email || activeChat.recipientEmail || '']
                        ? 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100'
                        : 'bg-[#fdf2e9] text-[#f08136] hover:bg-orange-100'
                    }`}
                    title={following[activeChat.recipient?.email || activeChat.recipientEmail || ''] ? 'Deixar de Seguir' : 'Seguir'}
                  >
                    {following[activeChat.recipient?.email || activeChat.recipientEmail || ''] ? (
                      <UserCheck size={18} />
                    ) : (
                      <UserPlus size={18} />
                    )}
                  </button>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(
                        `Confira o perfil de ${activeChat.recipient?.name || activeChat.recipientName}`
                      );
                      toast.success('Link do perfil copiado!');
                    }}
                    className="p-2 bg-gray-50 text-gray-600 hover:bg-gray-100 rounded-xl transition-colors"
                    title="Compartilhar Perfil"
                  >
                    <Share size={18} />
                  </button>
                </div>
              )}
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-4">
              <div className="flex justify-center mb-6">
                <span className="bg-gray-100 text-gray-500 text-[10px] font-bold uppercase tracking-wider px-3 py-1 rounded-full">
                  Início da conversa
                </span>
              </div>

              {activeChat.messages.map(msg => {
                const mine = isMyMessage(msg);
                return (
                  <div key={msg.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                    {/* Show avatar for received messages */}
                    {!mine && (
                      <div className="w-7 h-7 rounded-full bg-gray-200 overflow-hidden mr-2 mt-1 shrink-0 flex items-center justify-center">
                        {(activeChat.recipient?.avatar || activeChat.recipientAvatar) ? (
                          <img
                            src={activeChat.recipient?.avatar || activeChat.recipientAvatar}
                            alt={msg.senderName || 'Usuário'}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <User size={14} className="text-gray-400" />
                        )}
                      </div>
                    )}
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className={`max-w-[85%] md:max-w-[70%] rounded-2xl p-3.5 shadow-sm relative group ${
                        mine
                          ? 'bg-[#f08136] text-white rounded-tr-sm ml-8'
                          : 'bg-white text-gray-700 border border-gray-100 rounded-tl-sm mr-8'
                      }`}
                    >
                      {/* Sender name for received messages */}
                      {!mine && msg.senderName && (
                        <p className="text-[10px] font-bold text-[#f08136] mb-1">{msg.senderName}</p>
                      )}

                      {msg.text && (
                        <p className={`text-sm leading-relaxed ${mine ? 'text-white/95' : 'text-gray-700'}`}>
                          {msg.text}
                        </p>
                      )}

                      {msg.imageUrl && (
                        <img
                          src={msg.imageUrl}
                          alt="Mídia"
                          className="w-full max-w-[240px] h-auto object-cover rounded-xl mt-2 mb-1 shadow-sm border border-black/10"
                        />
                      )}

                      {msg.sharedPost && (
                        <div className={`mt-2 p-3 rounded-xl shadow-sm text-left ${mine ? 'bg-white/10 border border-white/20' : 'bg-gray-50 border border-gray-100'}`}>
                          <div className="flex items-center gap-2 mb-2">
                            <img src={msg.sharedPost.authorAvatar} alt="" className="w-6 h-6 rounded-full" />
                            <span className={`text-[11px] font-bold ${mine ? 'text-white' : 'text-gray-800'}`}>
                              {msg.sharedPost.authorName}
                            </span>
                          </div>
                          <p className={`text-xs font-bold truncate mb-2 ${mine ? 'text-white' : 'text-gray-800'}`}>
                            {msg.sharedPost.title}
                          </p>
                          <img src={msg.sharedPost.imageUrl} alt="" className="w-full h-32 object-cover rounded-lg" />
                        </div>
                      )}

                      <span className={`text-[10px] font-semibold mt-1.5 block ${mine ? 'text-white/70 text-right' : 'text-gray-400 text-left'}`}>
                        {msg.timestamp}
                      </span>
                    </motion.div>
                  </div>
                );
              })}
              <div ref={messagesEndRef} />
            </div>

            {/* Message Input */}
            <div className="p-4 bg-white border-t border-gray-100 shrink-0 pb-safe">
              <form onSubmit={handleSendMessage} className="flex gap-2 max-w-4xl mx-auto items-end">
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileChange}
                  accept="image/*"
                  className="hidden"
                />
                <div className="flex gap-1 mb-1">
                  <button
                    type="button"
                    onClick={handleSendMedia}
                    className="p-3 text-gray-400 hover:text-[#f08136] hover:bg-orange-50 rounded-xl transition-colors"
                    title="Enviar Mídia"
                  >
                    <ImageIcon size={22} />
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowSharePostModal(true)}
                    className="p-3 text-gray-400 hover:text-[#f08136] hover:bg-orange-50 rounded-xl transition-colors"
                    title="Compartilhar Publicação"
                  >
                    <Share2 size={22} />
                  </button>
                </div>

                <textarea
                  value={newMessage}
                  onChange={e => setNewMessage(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleSendMessage();
                    }
                  }}
                  placeholder="Digite sua mensagem..."
                  rows={1}
                  className="flex-1 bg-gray-50 border border-gray-200 rounded-2xl py-3.5 px-4 text-sm focus:outline-none focus:border-[#f08136] focus:bg-white transition-all shadow-xs resize-none"
                  style={{ minHeight: '52px', maxHeight: '120px' }}
                />
                <button
                  type="submit"
                  disabled={!newMessage.trim()}
                  className="w-12 h-[52px] bg-[#f08136] hover:bg-[#e66c19] text-white rounded-2xl flex items-center justify-center disabled:opacity-50 disabled:bg-gray-300 transition-all cursor-pointer shadow-md shadow-[#f08136]/20 active:scale-95 shrink-0"
                >
                  <Send size={18} className="-ml-0.5" />
                </button>
              </form>
            </div>
          </>
        ) : (
          <div className="hidden md:flex flex-1 flex-col items-center justify-center text-center p-8 bg-[#fafbfc]">
            <div className="w-24 h-24 bg-white rounded-3xl shadow-xs border border-gray-100 flex items-center justify-center mb-6">
              <MessageCircle size={40} className="text-gray-300" strokeWidth={1.5} />
            </div>
            <h2 className="text-xl font-extrabold text-gray-800 mb-2">Suas Mensagens</h2>
            <p className="text-gray-500 text-sm max-w-xs leading-relaxed">
              Selecione uma conversa ou clique em <strong>+</strong> para iniciar uma nova.
            </p>
          </div>
        )}
      </div>

      {/* New Chat Modal */}
      <AnimatePresence>
        {showNewChatModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white w-full max-w-md rounded-[2rem] shadow-2xl flex flex-col overflow-hidden max-h-[80vh]"
            >
              <div className="p-5 border-b border-gray-100 flex items-center justify-between">
                <h2 className="font-bold text-lg text-gray-800">Nova Conversa</h2>
                <button
                  onClick={() => setShowNewChatModal(false)}
                  className="p-2 bg-gray-50 hover:bg-gray-100 rounded-full text-gray-500 transition-colors"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="p-4 border-b border-gray-50">
                <div className="relative">
                  <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                  <input
                    type="text"
                    placeholder="Buscar usuários..."
                    value={userSearchQuery}
                    onChange={e => setUserSearchQuery(e.target.value)}
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl py-3 pl-11 pr-4 text-sm focus:outline-none focus:border-[#f08136] focus:bg-white"
                  />
                </div>
              </div>

              <div className="overflow-y-auto flex-1 p-2">
                {filteredUsers.length > 0 ? (
                  filteredUsers.map(user => (
                    <button
                      key={user.email}
                      onClick={() => handleStartChatWithUser(user)}
                      className="w-full flex items-center gap-4 p-3 hover:bg-gray-50 rounded-xl transition-colors text-left"
                    >
                      {user.avatar ? (
                        <img src={user.avatar} alt={user.name} className="w-12 h-12 rounded-full object-cover shadow-sm" />
                      ) : (
                        <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center">
                          <User size={24} className="text-gray-400" />
                        </div>
                      )}
                      <div>
                        <h3 className="font-bold text-gray-800 text-sm">{user.name}</h3>
                        <p className="text-xs text-gray-500">{user.email}</p>
                      </div>
                    </button>
                  ))
                ) : (
                  <p className="text-center text-gray-500 py-8 text-sm">Nenhum usuário encontrado.</p>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* User Profile Modal */}
      <AnimatePresence>
        {showProfile && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, y: 50 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 50 }}
              className="bg-white w-full max-w-sm rounded-[2rem] shadow-2xl flex flex-col overflow-hidden"
            >
              <div className="relative h-32 bg-gradient-to-r from-[#f08136] to-[#f49b5c]">
                <button
                  onClick={() => setShowProfile(null)}
                  className="absolute top-4 right-4 p-2 bg-black/20 text-white rounded-full hover:bg-black/30 transition-colors"
                >
                  <X size={20} />
                </button>
              </div>
              <div className="px-6 pb-8 pt-0 flex flex-col items-center -mt-16">
                <div className="w-32 h-32 rounded-full border-4 border-white shadow-lg mb-4 bg-gray-100 overflow-hidden flex items-center justify-center">
                  {showProfile.avatar ? (
                    <img src={showProfile.avatar} alt={showProfile.name} className="w-full h-full object-cover" />
                  ) : (
                    <User size={40} className="text-gray-400" />
                  )}
                </div>
                <h2 className="font-extrabold text-2xl text-gray-800">{showProfile.name}</h2>
                <p className="text-gray-500 text-sm mb-6">{showProfile.email}</p>

                <div className="flex gap-3 w-full">
                  <button
                    onClick={() => toggleFollow(showProfile.email)}
                    className={`flex-1 py-3 rounded-xl font-bold flex items-center justify-center gap-2 transition-colors ${
                      following[showProfile.email]
                        ? 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                        : 'bg-[#f08136] text-white hover:bg-[#e66c19]'
                    }`}
                  >
                    {following[showProfile.email] ? <UserCheck size={18} /> : <UserPlus size={18} />}
                    {following[showProfile.email] ? 'Seguindo' : 'Seguir'}
                  </button>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(`Confira o perfil de ${showProfile.name}`);
                      toast.success('Link copiado!');
                    }}
                    className="p-3 bg-gray-50 text-gray-700 hover:bg-gray-100 rounded-xl font-bold transition-colors"
                  >
                    <Share size={20} />
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Share Post Modal */}
      <AnimatePresence>
        {showSharePostModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white w-full max-w-md rounded-[2rem] shadow-2xl flex flex-col overflow-hidden max-h-[80vh]"
            >
              <div className="p-5 border-b border-gray-100 flex items-center justify-between">
                <h2 className="font-bold text-lg text-gray-800">Compartilhar Publicação</h2>
                <button
                  onClick={() => setShowSharePostModal(false)}
                  className="p-2 bg-gray-50 hover:bg-gray-100 rounded-full text-gray-500 transition-colors"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="overflow-y-auto flex-1 p-4 space-y-4">
                {feedPosts.length === 0 ? (
                  <p className="text-center text-gray-500 py-8 text-sm">Nenhuma publicação disponível.</p>
                ) : (
                  feedPosts.map(post => (
                    <div key={post.id} className="border border-gray-100 rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition-shadow">
                      <img src={post.imageUrl} alt={post.title} className="w-full h-32 object-cover" />
                      <div className="p-4">
                        <h3 className="font-bold text-gray-800 text-sm mb-1">{post.title}</h3>
                        <p className="text-xs text-gray-500 line-clamp-2 mb-3">{post.description}</p>
                        <button
                          onClick={() => handleSharePost(post)}
                          className="w-full py-2 bg-gray-50 hover:bg-gray-100 text-gray-700 font-bold text-sm rounded-xl transition-colors"
                        >
                          Enviar
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
}
