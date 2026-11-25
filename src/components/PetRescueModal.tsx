import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  X,
  QrCode,
  Phone,
  MapPin,
  ShieldCheck,
  AlertTriangle,
  Printer,
  Copy,
  Navigation,
  HeartPulse,
  Syringe,
  CheckCircle2,
  ExternalLink
} from 'lucide-react';
import { PetRecord, PublicPetRescueProfile } from '../types';
import { getPetRescueLink, getQrCodeImageUrl } from '../lib/petUtils';
import toast from 'react-hot-toast';

interface PetRescueModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Passed when the owner opens the modal from VaccinationBooklet */
  ownerViewPet?: PetRecord | null;
  ownerName?: string;
  ownerPhone?: string;
  ownerEmail?: string;
  /** Passed when a guest/rescuer scans a collar QR Code (#rg-pet-...) */
  publicProfile?: PublicPetRescueProfile | null;
  isPublicRescueMode?: boolean;
}

export default function PetRescueModal({
  isOpen,
  onClose,
  ownerViewPet,
  ownerName,
  ownerPhone,
  ownerEmail,
  publicProfile,
  isPublicRescueMode = false
}: PetRescueModalProps) {
  const [sendingGps, setSendingGps] = useState(false);
  const [activeMode, setActiveMode] = useState<'rg' | 'collar' | 'rescue'>(
    isPublicRescueMode ? 'rescue' : 'rg'
  );

  if (!isOpen) return null;

  const pet = publicProfile?.pet || ownerViewPet;
  if (!pet) return null;

  const tutorName = publicProfile?.owner?.name || ownerName || 'Tutor UniãoPet';
  const tutorPhone = publicProfile?.owner?.phone || ownerPhone || '';
  const tutorEmail = publicProfile?.owner?.email || ownerEmail || pet.ownerEmail || '';
  const emergencyVet = publicProfile?.owner?.emergencyVet || null;

  const rescueUrl = getPetRescueLink(pet.id);
  const qrImageUrl = getQrCodeImageUrl(rescueUrl, 280);

  const handleCopyLink = () => {
    navigator.clipboard.writeText(rescueUrl).then(() => {
      toast.success('Link do RG Digital / Coleira copiado!');
    });
  };

  const handleSendGpsToOwnerWhatsApp = () => {
    const cleanPhone = tutorPhone.replace(/\D/g, '');
    if (!cleanPhone) {
      toast.error('O tutor ainda não cadastrou telefone com WhatsApp no perfil.');
      return;
    }

    if (!navigator.geolocation) {
      const msg = encodeURIComponent(
        `🐾 *ALERTA DE RESGATE UNIÃOPET*\nOlá, ${tutorName}! Escaneie a coleira QR Code do(a) *${pet.name}* e estou com ele(a) agora!`
      );
      window.open(`https://wa.me/55${cleanPhone}?text=${msg}`, '_blank');
      return;
    }

    setSendingGps(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setSendingGps(false);
        const { latitude, longitude } = pos.coords;
        const mapsUrl = `https://www.google.com/maps?q=${latitude},${longitude}`;
        const msg = encodeURIComponent(
          `🐾 *ALERTA DE RESGATE UNIÃOPET*\n\nOlá, ${tutorName}! Escaneei o QR Code da coleira do(a) *${pet.name}* e encontrei ele(a)!\n\n📍 *Minha localização GPS exata agora:*\n${mapsUrl}\n\nEntre em contato comigo para combinarmos a entrega com segurança.`
        );
        window.open(`https://wa.me/55${cleanPhone}?text=${msg}`, '_blank');
      },
      () => {
        setSendingGps(false);
        const msg = encodeURIComponent(
          `🐾 *ALERTA DE RESGATE UNIÃOPET*\nOlá, ${tutorName}! Escaneei o QR Code da coleira do(a) *${pet.name}* e estou com ele(a) agora!`
        );
        window.open(`https://wa.me/55${cleanPhone}?text=${msg}`, '_blank');
      },
      { enableHighAccuracy: true, timeout: 8000 }
    );
  };

  const upToDateVaccines = (pet.vaccines || []).filter((v) => v.type === 'vacina');

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/65 backdrop-blur-md overflow-y-auto">
        <motion.div
          initial={{ opacity: 0, scale: 0.94, y: 18 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.94, y: 18 }}
          transition={{ type: 'spring', damping: 26, stiffness: 320 }}
          className="bg-white rounded-[2rem] shadow-2xl max-w-xl w-full overflow-hidden flex flex-col max-h-[92vh] border border-slate-100"
        >
          {/* Top Bar */}
          <div className="p-4 sm:p-5 bg-slate-900 text-white flex items-center justify-between shrink-0 print:hidden">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-[#f08136] flex items-center justify-center shadow-md shadow-[#f08136]/30">
                <QrCode size={20} />
              </div>
              <div>
                <h2 className="font-black text-base tracking-tight leading-none">
                  {activeMode === 'rescue'
                    ? `Ficha Pública de Resgate — ${pet.name}`
                    : `RG Digital & Coleira QR — ${pet.name}`}
                </h2>
                <p className="text-[11px] text-slate-400 font-medium mt-1">
                  Identificação inteligente UniãoPet • Passaporte Oficial
                </p>
              </div>
            </div>

            <button
              onClick={onClose}
              className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white transition-all cursor-pointer"
            >
              <X size={18} />
            </button>
          </div>

          {/* Mode Switcher (Owner View) */}
          {!isPublicRescueMode && (
            <div className="bg-slate-50 border-b border-slate-200/70 p-2 flex gap-1.5 shrink-0 print:hidden">
              <button
                onClick={() => setActiveMode('rg')}
                className={`flex-1 py-2 px-3 rounded-xl text-xs font-extrabold transition-all cursor-pointer ${
                  activeMode === 'rg'
                    ? 'bg-white text-slate-900 shadow-xs border border-slate-200/80'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                🪪 RG Digital do Pet
              </button>
              <button
                onClick={() => setActiveMode('collar')}
                className={`flex-1 py-2 px-3 rounded-xl text-xs font-extrabold transition-all cursor-pointer ${
                  activeMode === 'collar'
                    ? 'bg-white text-[#f08136] shadow-xs border border-orange-200'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                🏷️ Imprimir Pingente QR
              </button>
              <button
                onClick={() => setActiveMode('rescue')}
                className={`flex-1 py-2 px-3 rounded-xl text-xs font-extrabold transition-all cursor-pointer ${
                  activeMode === 'rescue'
                    ? 'bg-white text-emerald-700 shadow-xs border border-emerald-200'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                📱 Simular Resgate
              </button>
            </div>
          )}

          {/* Body Content */}
          <div className="p-5 sm:p-6 overflow-y-auto flex-1 space-y-5 bg-slate-50/50 print:bg-white print:p-0">
            {activeMode === 'rg' && (
              <>
                {/* Official Brazilian-Style Digital Pet ID Card */}
                <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-emerald-900 via-emerald-800 to-teal-900 text-white p-6 shadow-xl border border-emerald-700/60">
                  <div className="absolute -right-12 -top-12 w-44 h-44 rounded-full bg-white/5 blur-2xl pointer-events-none" />
                  <div className="flex items-center justify-between border-b border-white/15 pb-3 mb-4">
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-widest text-emerald-300">
                        REPÚBLICA DOS PETS • UNIÃOPET BRASIL
                      </p>
                      <h3 className="text-sm font-black tracking-wide uppercase">
                        Carteira de Identidade Animal (RG Pet)
                      </h3>
                    </div>
                    <span className="px-2.5 py-1 rounded-full bg-white/15 text-[10px] font-mono font-bold">
                      ID #{pet.id.slice(-6).toUpperCase()}
                    </span>
                  </div>

                  <div className="flex flex-col sm:flex-row items-center gap-5">
                    <img
                      src={pet.avatar || 'https://images.unsplash.com/photo-1548767797-d8c844163c4c?auto=format&fit=crop&q=80&w=300'}
                      alt={pet.name}
                      className="w-28 h-28 rounded-2xl object-cover border-3 border-white shadow-lg shrink-0"
                    />

                    <div className="flex-1 grid grid-cols-2 gap-x-4 gap-y-2 text-xs w-full">
                      <div className="col-span-2">
                        <span className="text-[10px] uppercase text-emerald-300 font-bold block">Nome do Animal</span>
                        <span className="text-xl font-black tracking-tight">{pet.name}</span>
                      </div>
                      <div>
                        <span className="text-[10px] uppercase text-emerald-300 font-bold block">Espécie / Raça</span>
                        <span className="font-bold">{pet.breed || 'SRD'}</span>
                      </div>
                      <div>
                        <span className="text-[10px] uppercase text-emerald-300 font-bold block">Sexo / Porte</span>
                        <span className="font-bold">
                          {pet.gender === 'femea' ? 'Fêmea' : 'Macho'} {pet.weight ? `• ${pet.weight}` : ''}
                        </span>
                      </div>
                      <div>
                        <span className="text-[10px] uppercase text-emerald-300 font-bold block">Tutor Responsável</span>
                        <span className="font-bold truncate block">{tutorName}</span>
                      </div>
                      <div>
                        <span className="text-[10px] uppercase text-emerald-300 font-bold block">Microchip</span>
                        <span className="font-mono font-bold">{pet.microchip || 'Não cadastrado'}</span>
                      </div>
                    </div>

                    <div className="bg-white p-2.5 rounded-2xl shadow-md shrink-0 flex flex-col items-center">
                      <img src={qrImageUrl} alt="QR Code RG Pet" className="w-24 h-24 rounded-lg" />
                      <span className="text-[9px] font-black text-slate-800 uppercase mt-1 tracking-tight">
                        Escaneie em Resgate
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 bg-white p-4 rounded-2xl border border-slate-200/80">
                  <div className="text-xs text-slate-600">
                    <p className="font-extrabold text-slate-800">Link Público de Resgate da Coleira</p>
                    <p className="text-[11px] text-slate-400 truncate max-w-xs">{rescueUrl}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={handleCopyLink}
                      className="px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-all"
                    >
                      <Copy size={14} />
                      <span>Copiar Link</span>
                    </button>
                    <button
                      onClick={() => window.print()}
                      className="px-3.5 py-2 rounded-xl bg-[#f08136] hover:bg-[#d96e27] text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-all shadow-sm"
                    >
                      <Printer size={14} />
                      <span>Imprimir RG</span>
                    </button>
                  </div>
                </div>
              </>
            )}

            {activeMode === 'collar' && (
              <div className="space-y-5">
                <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 text-xs text-amber-900 print:hidden">
                  <p className="font-black text-sm mb-1">🏷️ Como fazer o Pingente QR Code para a Coleira:</p>
                  <ol className="list-decimal list-inside space-y-1 text-amber-800">
                    <li>Clique em <strong>Imprimir Pingentes</strong> abaixo.</li>
                    <li>Recorte o modelo desejado (Redondo 3,5cm ou Retangular 4,5cm) e plastifique com fita transparente larga ou papel contact.</li>
                    <li>Prenda na argola da coleira. Qualquer pessoa que encontrar <strong>{pet.name}</strong> poderá escanear com a câmera e te enviar a localização GPS no WhatsApp!</li>
                  </ol>
                </div>

                {/* Printable Collar Tags Sheet */}
                <div className="bg-white rounded-3xl border-2 border-dashed border-slate-300 p-6 flex flex-col sm:flex-row items-center justify-around gap-6">
                  {/* Circular Tag */}
                  <div className="flex flex-col items-center">
                    <div className="w-40 h-40 rounded-full border-4 border-[#f08136] bg-white shadow-md flex flex-col items-center justify-center p-3 text-center relative">
                      <div className="w-3.5 h-3.5 rounded-full border-2 border-slate-400 bg-slate-100 -mt-1 mb-1" title="Furo para argola" />
                      <span className="text-[10px] font-black uppercase tracking-wider text-[#f08136]">
                        ESTOU PERDIDO?
                      </span>
                      <img src={qrImageUrl} alt="QR" className="w-20 h-20 my-0.5" />
                      <span className="text-xs font-black text-slate-900 uppercase truncate max-w-[110px]">
                        {pet.name}
                      </span>
                      {tutorPhone && (
                        <span className="text-[9px] font-mono font-bold text-slate-600">
                          {tutorPhone}
                        </span>
                      )}
                    </div>
                    <span className="text-[11px] font-bold text-slate-400 mt-2 print:hidden">
                      Pingente Redondo (Coleira)
                    </span>
                  </div>

                  {/* Rectangular Badge Tag */}
                  <div className="flex flex-col items-center">
                    <div className="w-56 rounded-2xl border-4 border-slate-900 bg-white shadow-md p-3.5 flex items-center gap-3">
                      <img src={qrImageUrl} alt="QR" className="w-20 h-20 shrink-0" />
                      <div className="min-w-0 text-left">
                        <span className="inline-block px-2 py-0.5 rounded bg-red-600 text-white text-[9px] font-black uppercase">
                          ME ESCANEIE
                        </span>
                        <h4 className="font-black text-slate-900 text-base uppercase truncate mt-1">
                          {pet.name}
                        </h4>
                        <p className="text-[10px] font-bold text-slate-600 truncate">
                          Tutor: {tutorName}
                        </p>
                        <p className="text-[10px] font-mono font-black text-slate-900 mt-0.5">
                          {tutorPhone || 'UniãoPet QR'}
                        </p>
                      </div>
                    </div>
                    <span className="text-[11px] font-bold text-slate-400 mt-2 print:hidden">
                      Etiqueta Peitoral / Guia
                    </span>
                  </div>
                </div>

                <div className="flex justify-end print:hidden">
                  <button
                    onClick={() => window.print()}
                    className="w-full sm:w-auto px-5 py-3 rounded-2xl bg-[#f08136] hover:bg-[#d96e27] text-white text-xs font-black flex items-center justify-center gap-2 cursor-pointer shadow-md shadow-[#f08136]/20"
                  >
                    <Printer size={16} />
                    <span>Imprimir Pingentes para Coleira</span>
                  </button>
                </div>
              </div>
            )}

            {activeMode === 'rescue' && (
              <div className="space-y-4">
                {/* Urgent Public Rescue Banner */}
                <div className="bg-gradient-to-r from-emerald-600 to-teal-600 text-white rounded-3xl p-5 shadow-lg">
                  <div className="flex items-center gap-4">
                    <img
                      src={pet.avatar || 'https://images.unsplash.com/photo-1548767797-d8c844163c4c?auto=format&fit=crop&q=80&w=300'}
                      alt={pet.name}
                      className="w-20 h-20 rounded-2xl object-cover border-3 border-white shadow-md shrink-0"
                    />
                    <div className="min-w-0">
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-white/20 text-[10px] font-black uppercase tracking-wider">
                        🐾 Identificação Oficial UniãoPet
                      </span>
                      <h3 className="text-2xl font-black tracking-tight mt-1">
                        Olá! Eu sou {pet.name}
                      </h3>
                      <p className="text-xs text-emerald-100 font-medium">
                        {pet.breed || 'SRD'} • {pet.gender === 'femea' ? 'Fêmea' : 'Macho'}
                        {pet.weight ? ` • ${pet.weight}` : ''}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Primary Rescue Actions: Send GPS & Call Tutor */}
                <div className="bg-white rounded-3xl p-5 border border-slate-200/80 shadow-xs space-y-3">
                  <h4 className="text-xs font-black uppercase tracking-wider text-slate-500">
                    Você encontrou este pet? Avise o tutor agora:
                  </h4>

                  <button
                    onClick={handleSendGpsToOwnerWhatsApp}
                    disabled={sendingGps}
                    className="w-full py-3.5 px-4 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-sm flex items-center justify-center gap-2.5 shadow-lg shadow-emerald-600/25 active:scale-98 transition-all cursor-pointer"
                  >
                    <Navigation size={18} className={sendingGps ? 'animate-spin' : ''} />
                    <span>
                      {sendingGps
                        ? 'Obtendo localização GPS...'
                        : '📍 Enviar Minha Localização GPS no WhatsApp'}
                    </span>
                  </button>

                  {tutorPhone && (
                    <div className="grid grid-cols-2 gap-2.5">
                      <a
                        href={`tel:${tutorPhone.replace(/[^0-9+]/g, '')}`}
                        className="py-3 px-4 rounded-2xl bg-slate-900 hover:bg-black text-white font-bold text-xs flex items-center justify-center gap-2 transition-all text-center"
                      >
                        <Phone size={15} />
                        <span>Ligar ({tutorPhone})</span>
                      </a>
                      <button
                        onClick={() => {
                          const clean = tutorPhone.replace(/\D/g, '');
                          const msg = encodeURIComponent(`Olá ${tutorName}! Encontrei seu pet ${pet.name} pelo QR Code do UniãoPet!`);
                          window.open(`https://wa.me/55${clean}?text=${msg}`, '_blank');
                        }}
                        className="py-3 px-4 rounded-2xl bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 font-bold text-xs flex items-center justify-center gap-2 transition-all cursor-pointer"
                      >
                        <span>💬 Chamar no WhatsApp</span>
                      </button>
                    </div>
                  )}

                  <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-xs text-slate-600">
                    <span>Tutor(a) Responsável:</span>
                    <strong className="text-slate-900">{tutorName}</strong>
                  </div>
                </div>

                {/* Health, Allergies & Vaccine Summary for Rescuer */}
                <div className="bg-white rounded-3xl p-5 border border-slate-200/80 shadow-xs space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-black uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                      <HeartPulse size={15} className="text-red-500" />
                      <span>Informações Médicas & Vacinas</span>
                    </h4>
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 text-[11px] font-bold">
                      <CheckCircle2 size={12} />
                      {upToDateVaccines.length} vacina(s) registrada(s)
                    </span>
                  </div>

                  {(pet.notes || pet.allergies) ? (
                    <div className="p-3 rounded-2xl bg-amber-50 border border-amber-200 text-xs text-amber-900">
                      <strong>⚠️ Observações / Alergias:</strong> {pet.allergies || pet.notes}
                    </div>
                  ) : (
                    <p className="text-xs text-slate-500">
                      Nenhuma restrição alimentar ou alergia grave informada pelo tutor.
                    </p>
                  )}

                  {pet.microchip && (
                    <p className="text-xs font-mono text-slate-600 bg-slate-50 p-2.5 rounded-xl">
                      <strong>Microchip Oficial:</strong> {pet.microchip}
                    </p>
                  )}

                  {emergencyVet && (
                    <div className="p-3 rounded-2xl bg-red-50/70 border border-red-100 flex items-center justify-between gap-2">
                      <div className="text-xs">
                        <p className="font-black text-red-800">Clínica Veterinária do Pet:</p>
                        <p className="text-red-700 font-semibold">{emergencyVet.name} • {emergencyVet.phone}</p>
                      </div>
                      <a
                        href={`tel:${emergencyVet.phone.replace(/[^0-9+]/g, '')}`}
                        className="px-3 py-1.5 rounded-xl bg-red-600 text-white text-[11px] font-bold shrink-0"
                      >
                        Ligar Vet
                      </a>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
