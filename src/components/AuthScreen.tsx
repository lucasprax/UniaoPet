import React, { useState } from 'react';
import { useAuth } from '../lib/AuthContext';
import { motion, AnimatePresence } from 'motion/react';
import { Heart, Mail, Lock, User, Image as ImageIcon, X, ArrowRight } from 'lucide-react';
import toast from 'react-hot-toast';
import { compressImageFile } from '../lib/imageCompressor';

interface AuthScreenProps {
  onClose?: () => void;
}

export default function AuthScreen({ onClose }: AuthScreenProps) {
  const { login, register } = useAuth();
  const [isLogin, setIsLogin] = useState(true);
  
  // Form State
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [avatar, setAvatar] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      toast.error('Preencha os campos obrigatórios.');
      return;
    }
    
    setLoading(true);
    try {
        if (isLogin) {
        await login(email, password);
        onClose?.();
      } else {
        if (!name.trim()) {
          toast.error('Por favor, informe seu nome completo.');
          setLoading(false);
          return;
        }
        await register(name, email, password, avatar);
        onClose?.();
      }
    } catch (err: any) {
      // Toast handles error display in AuthContext
    } finally {
      setLoading(false);
    }
  };

  const toggleMode = () => {
    setIsLogin(!isLogin);
    setName('');
    setPassword('');
  };

  // Convert image to compressed base64 for avatar
  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      try {
        const compressed = await compressImageFile(file, { maxWidth: 400, maxHeight: 400, quality: 0.8 });
        setAvatar(compressed);
      } catch (err: any) {
        toast.error(err?.message || 'Erro ao processar imagem');
      }
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        
        {/* Logo Section */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-3xl bg-[#fdf2e9] text-[#f08136] shadow-sm mb-4">
            <span className="text-4xl">🐾</span>
          </div>
          <h1 className="text-3xl font-extrabold text-gray-800 tracking-tight">União Pet</h1>
          <p className="text-sm text-gray-500 font-medium mt-1">Sua comunidade de amor animal</p>
        </div>

        {/* Auth Card */}
        <div className="bg-white rounded-[2rem] shadow-[0_8px_30px_rgb(0,0,0,0.04)] p-8">
          <AnimatePresence mode="wait">
            <motion.div
              key={isLogin ? 'login' : 'register'}
              initial={{ opacity: 0, x: isLogin ? -20 : 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: isLogin ? 20 : -20 }}
              transition={{ duration: 0.2 }}
            >
              <h2 className="text-2xl font-bold text-gray-800 mb-6 text-center">
                {isLogin ? 'Entrar na sua conta' : 'Criar nova conta'}
              </h2>

              <form onSubmit={handleSubmit} className="space-y-4">
                
                {!isLogin && (
                  <>
                    <div>
                      <label className="block text-xs font-bold text-gray-700 mb-1.5 uppercase tracking-wide">
                        Seu Nome
                      </label>
                      <div className="relative">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400">
                          <User size={18} />
                        </div>
                        <input
                          type="text"
                          value={name}
                          onChange={(e) => setName(e.target.value)}
                          className="w-full pl-10 pr-4 py-3 bg-gray-50 border border-gray-100 rounded-xl focus:bg-white focus:ring-2 focus:ring-[#f08136]/20 focus:border-[#f08136] transition-all outline-none text-sm font-medium"
                          placeholder="Ex: João Silva"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-gray-700 mb-1.5 uppercase tracking-wide">
                        Foto de Perfil (Opcional)
                      </label>
                      <div className="flex items-center gap-4">
                        {avatar ? (
                          <img src={avatar} alt="Preview" className="w-12 h-12 rounded-full object-cover shrink-0" />
                        ) : (
                          <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center text-gray-400 shrink-0">
                            <ImageIcon size={20} />
                          </div>
                        )}
                        <label className="flex-1 px-4 py-2.5 bg-gray-50 border border-gray-100 rounded-xl cursor-pointer hover:bg-gray-100 transition-colors text-sm font-medium text-gray-600 text-center">
                          Escolher imagem
                          <input type="file" accept="image/*" className="hidden" onChange={handleAvatarChange} />
                        </label>
                      </div>
                    </div>
                  </>
                )}

                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1.5 uppercase tracking-wide">
                    E-mail
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400">
                      <Mail size={18} />
                    </div>
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full pl-10 pr-4 py-3 bg-gray-50 border border-gray-100 rounded-xl focus:bg-white focus:ring-2 focus:ring-[#f08136]/20 focus:border-[#f08136] transition-all outline-none text-sm font-medium"
                      placeholder="seu@email.com"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1.5 uppercase tracking-wide">
                    Senha
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400">
                      <Lock size={18} />
                    </div>
                    <input
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full pl-10 pr-4 py-3 bg-gray-50 border border-gray-100 rounded-xl focus:bg-white focus:ring-2 focus:ring-[#f08136]/20 focus:border-[#f08136] transition-all outline-none text-sm font-medium"
                      placeholder="••••••••"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full mt-6 bg-gradient-to-r from-[#f08136] to-[#e66c19] text-white py-3.5 rounded-xl font-bold shadow-md shadow-[#f08136]/20 hover:shadow-lg hover:shadow-[#f08136]/30 active:scale-[0.98] transition-all disabled:opacity-70 disabled:cursor-not-allowed"
                >
                  {loading ? 'Carregando...' : (isLogin ? 'Entrar' : 'Criar Conta')}
                </button>
              </form>
            </motion.div>
          </AnimatePresence>
        </div>

        <div className="text-center mt-6 space-y-3">
          <p className="text-sm text-gray-500">
            {isLogin ? "Ainda não tem uma conta?" : "Já possui uma conta?"}
            <button 
              onClick={toggleMode}
              className="ml-2 font-bold text-[#f08136] hover:text-[#e66c19] transition-colors cursor-pointer"
            >
              {isLogin ? "Cadastre-se" : "Faça Login"}
            </button>
          </p>

          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="inline-flex items-center gap-1.5 text-xs font-extrabold text-slate-600 hover:text-slate-900 bg-white px-4 py-2.5 rounded-full border border-slate-200 shadow-2xs transition-all cursor-pointer"
            >
              <span>Continuar explorando o Feed sem conta</span>
              <ArrowRight size={14} />
            </button>
          )}
        </div>
        
      </div>
    </div>
  );
}
