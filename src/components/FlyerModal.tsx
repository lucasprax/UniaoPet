import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Printer, Copy, X, MapPin, Download, QrCode, Sparkles } from 'lucide-react';
import { Post } from '../types';
import { getPostDeepLink, getQrCodeImageUrl, generateStoryFlyerPng } from '../lib/petUtils';
import toast from 'react-hot-toast';

interface FlyerModalProps {
  post: Post | null;
  isOpen: boolean;
  onClose: () => void;
}

export default function FlyerModal({ post, isOpen, onClose }: FlyerModalProps) {
  const [downloadingPng, setDownloadingPng] = useState(false);

  if (!isOpen || !post) return null;

  const isDesaparecido = post.category === 'desaparecido';
  const isAdocao = post.category === 'adoção' || post.category === 'adocao';

  const titleBanner = isDesaparecido
    ? 'PROCURA-SE URGENTE'
    : isAdocao
    ? 'ME ADOTE COM AMOR'
    : 'DOAÇÃO SOLIDÁRIA';

  const bannerColor = isDesaparecido
    ? 'bg-red-600 text-white'
    : isAdocao
    ? 'bg-emerald-600 text-white'
    : 'bg-blue-600 text-white';

  const borderColor = isDesaparecido
    ? 'border-red-600'
    : isAdocao
    ? 'border-emerald-600'
    : 'border-blue-600';

  const postUrl = getPostDeepLink(post.id);
  const qrUrl = getQrCodeImageUrl(postUrl, 220);

  const handlePrint = () => {
    window.print();
  };

  const handleCopyText = () => {
    const text =
      `🐾 *${titleBanner}* 🐾\n\n` +
      `📌 *Nome do Pet:* ${post.petName || 'Não informado'}\n` +
      `📍 *Local:* ${post.location}\n` +
      `📞 *Contato / WhatsApp:* ${post.phone || 'Via UniãoPet'}\n\n` +
      `📝 *Detalhes:* ${post.description}\n\n` +
      `🔗 *Ver anúncio completo:* ${postUrl}\n` +
      `Compartilhe pelo UniãoPet para ajudar! ❤️`;

    navigator.clipboard
      .writeText(text)
      .then(() => {
        toast.success('Texto com link copiado para o WhatsApp!');
      })
      .catch(() => {
        toast.error('Erro ao copiar texto.');
      });
  };

  const handleDownloadStoryPng = async () => {
    setDownloadingPng(true);
    try {
      const blob = await generateStoryFlyerPng(post);
      const safeName = (post.petName || 'pet').toLowerCase().replace(/[^a-z0-9]+/g, '-');
      const filename = `cartaz-uniaopet-${safeName}.png`;

      // Use native Web Share with file on mobile if supported
      const file = new File([blob], filename, { type: 'image/png' });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        try {
          await navigator.share({
            title: `UniãoPet — ${post.petName || post.title}`,
            text: `Ajude a divulgar: ${post.title}`,
            files: [file]
          });
          toast.success('Cartaz compartilhado!');
          setDownloadingPng(false);
          return;
        } catch {}
      }

      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success('Imagem PNG para Stories baixada com sucesso! 📲');
    } catch (err) {
      console.error(err);
      toast.error('Não foi possível gerar a imagem PNG.');
    } finally {
      setDownloadingPng(false);
    }
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/65 backdrop-blur-md overflow-y-auto">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 15 }}
          transition={{ type: 'spring', damping: 26, stiffness: 320 }}
          className="bg-white rounded-3xl shadow-2xl max-w-lg w-full overflow-hidden flex flex-col max-h-[95vh] border border-slate-100"
        >
          {/* Header controls (Screen only) */}
          <div className="p-4 bg-slate-50 border-b border-slate-200/70 flex flex-wrap items-center justify-between gap-2 shrink-0 print:hidden">
            <div className="flex items-center gap-2">
              <span className="text-xs font-black uppercase tracking-wider text-slate-800 flex items-center gap-1.5">
                <Sparkles size={14} className="text-[#f08136]" />
                Cartaz & Story c/ QR Code
              </span>
            </div>
            <div className="flex items-center gap-1.5 flex-wrap">
              <button
                onClick={handleDownloadStoryPng}
                disabled={downloadingPng}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 hover:bg-black text-white text-xs font-bold rounded-xl shadow-xs transition-all cursor-pointer disabled:opacity-60"
                title="Baixar imagem 1080x1920 pronta para Stories do Instagram e Status do WhatsApp"
              >
                <Download size={13} />
                <span>{downloadingPng ? 'Gerando...' : 'Baixar Story (PNG)'}</span>
              </button>

              <button
                onClick={handlePrint}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#f08136] hover:bg-[#d96e27] text-white text-xs font-bold rounded-xl shadow-xs transition-all cursor-pointer"
              >
                <Printer size={13} />
                <span>Imprimir / PDF</span>
              </button>

              <button
                onClick={handleCopyText}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 hover:bg-slate-100 text-slate-700 text-xs font-bold rounded-xl transition-all cursor-pointer"
              >
                <Copy size={13} />
                <span>Texto WhatsApp</span>
              </button>

              <button
                onClick={onClose}
                className="p-1.5 rounded-xl hover:bg-slate-200 text-slate-400 hover:text-slate-700 transition-all cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>
          </div>

          {/* Printable Flyer Preview */}
          <div className="p-5 sm:p-6 overflow-y-auto flex-1 flex justify-center bg-slate-100/70 print:bg-white print:p-0">
            <div
              id="printable-flyer"
              className={`bg-white border-4 ${borderColor} rounded-2xl p-6 max-w-md w-full shadow-lg print:shadow-none print:border-4 print:p-8 flex flex-col items-center text-center`}
            >
              {/* Banner Top */}
              <div
                className={`w-full py-3.5 px-4 rounded-xl ${bannerColor} font-black text-xl sm:text-2xl uppercase tracking-wider text-center shadow-xs mb-4`}
              >
                {titleBanner}
              </div>

              {/* Pet Image */}
              {post.imageUrl ? (
                <div className="w-full aspect-4/3 rounded-xl overflow-hidden border-2 border-slate-200 mb-4 bg-slate-50 flex items-center justify-center">
                  <img
                    src={post.imageUrl}
                    alt={post.petName}
                    className="w-full h-full object-cover"
                  />
                </div>
              ) : (
                <div className="w-full h-40 rounded-xl bg-slate-100 flex items-center justify-center text-slate-400 font-bold mb-4">
                  Foto do Pet
                </div>
              )}

              {/* Pet Name */}
              <h2 className="text-3xl font-black text-slate-900 tracking-tight mb-1 uppercase">
                {post.petName || post.title}
              </h2>

              {/* Location Badge */}
              <div className="inline-flex items-center gap-1.5 text-sm font-extrabold text-slate-700 bg-slate-100 px-3 py-1.5 rounded-full mb-3">
                <MapPin size={16} className="text-red-600" />
                <span>{post.location}</span>
              </div>

              {/* Description */}
              <div className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3.5 text-xs text-slate-800 text-left mb-4 leading-relaxed font-medium">
                <p className="font-bold text-slate-900 mb-1">Informações & Características:</p>
                <p>{post.description}</p>
              </div>

              {/* Big Phone + Scannable QR Code Box */}
              <div className="w-full bg-yellow-300 border-2 border-yellow-500 rounded-2xl p-3.5 shadow-xs mb-3 flex items-center justify-between gap-3 text-left">
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] font-black uppercase tracking-wider text-yellow-950">
                    {isDesaparecido
                      ? 'VIU ESTE ANIMAL? LIGUE OU CHAME:'
                      : 'QUER ADOTAR OU AJUDAR? CONTATO:'}
                  </p>
                  <p className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight mt-0.5 font-mono truncate">
                    {post.phone || 'Via App UniãoPet'}
                  </p>
                  {post.authorName && (
                    <p className="text-xs font-bold text-slate-800 mt-0.5 truncate">
                      Falar com: {post.authorName}
                    </p>
                  )}
                  <p className="text-[10px] font-extrabold text-yellow-950 mt-1 flex items-center gap-1">
                    <QrCode size={11} />
                    <span>Aponte a câmera para o QR Code →</span>
                  </p>
                </div>

                <div className="bg-white p-1.5 rounded-xl shadow-xs shrink-0 flex flex-col items-center">
                  <img src={qrUrl} alt="QR Code do Anúncio" className="w-20 h-20" />
                </div>
              </div>

              {/* Footer */}
              <div className="text-[10px] text-slate-400 font-bold uppercase tracking-widest pt-2 border-t border-slate-100 w-full">
                🐾 UniãoPet • Conectando corações e salvando vidas
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
