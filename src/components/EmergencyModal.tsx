import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  AlertTriangle, Phone, MapPin, X, ShieldAlert, HeartPulse, 
  Flame, Skull, Droplets, Bug, Sparkles, Check, Edit2, Save, ExternalLink 
} from 'lucide-react';
import { EmergencyVetContact, AiTriageResponse } from '../types';
import * as api from '../lib/apiService';
import toast from 'react-hot-toast';

interface EmergencyModalProps {
  isOpen: boolean;
  onClose: () => void;
  userEmail?: string;
}

const FIRST_AID_TOPICS = [
  {
    id: 'choking',
    icon: HeartPulse,
    color: 'text-red-600 bg-red-50 border-red-200',
    title: 'Engasgo & Asfixia (Manobra de Heimlich)',
    urgency: 'Crítica — Aja Imediatamente',
    symptoms: 'Animal tossindo forte, pata no focinho, baba excessiva, gengiva azulada.',
    steps: [
      'Abra a boca do pet com cuidado e puxe a língua para frente.',
      'Se o objeto for visível e estiver solto, tente removê-lo com os dedos em pinça (CUIDADO para não empurrar mais fundo ou tomar mordida involuntária).',
      'Manobra em cães médios/grandes: Fique atrás dele, envolva o abdômen logo abaixo da última costela e faça 4 a 5 compressões firmes para cima e para frente.',
      'Manobra em cães pequenos/gatos: Deite o animal de lado, apoie uma mão nas costas e use a outra para pressionar a barriga (logo abaixo das costelas) para dentro e para cima.',
      'Verifique novamente a garganta e retire o objeto expelido.'
    ]
  },
  {
    id: 'poison',
    icon: Skull,
    color: 'text-amber-600 bg-amber-50 border-amber-200',
    title: 'Intoxicação & Envenenamento',
    urgency: 'Crítica — Risco à Vida',
    symptoms: 'Vômitos súbitos, saliva espumosa, tremores, convulsão, pupilas dilatadas.',
    steps: [
      'NUNCA induza o vômito se você não souber a substância (produtos cáusticos queimam a garganta na volta!).',
      'NUNCA dê leite, azeite ou clara de ovo (eles podem acelerar a absorção do veneno no organismo).',
      'Identifique o causador: veneno de rato (chumbinho), inseticida, remédio humano, planta tóxica ou chocolate.',
      'Fotografe ou guarde a embalagem e o rótulo da substância para mostrar ao veterinário.',
      'Leve o animal com extrema urgência ao hospital veterinário mais próximo.'
    ]
  },
  {
    id: 'heatstroke',
    icon: Flame,
    color: 'text-orange-600 bg-orange-50 border-orange-200',
    title: 'Golpe de Calor (Hipertermia)',
    urgency: 'Alta — Resfriamento Gradual',
    symptoms: 'Ofegância desesperada, língua escura, fraqueza nas patas, temperatura corporal muito alta.',
    steps: [
      'Retire o animal do sol ou do ambiente abafado imediatamente para a sombra ou local com ar-condicionado.',
      'Molhe o corpo do pet com água em temperatura ambiente ou fresca nas patas, virilha e cabeça.',
      'NÃO use gelo ou água congelada (o choque térmico causa vasoconstrição severa e piora a retenção de calor).',
      'Ofereça pequenos goles de água fresca se o animal estiver consciente.',
      'Transporte para a clínica com o carro ventilado.'
    ]
  },
  {
    id: 'bleeding',
    icon: Droplets,
    color: 'text-rose-600 bg-rose-50 border-rose-200',
    title: 'Cortes & Hemorragias',
    urgency: 'Alta — Estancamento',
    symptoms: 'Sangramento contínuo em patas, orelhas ou corpo por corte com vidro/arame ou mordida.',
    steps: [
      'Aplique pressão direta contínua sobre o ferimento usando uma toalha limpa ou gaze esterilizada.',
      'Mantenha a pressão constante por no mínimo 5 minutos ininterruptos sem levantar para olhar.',
      'Se o sangue passar pela toalha, coloque outra toalha por cima sem remover a primeira.',
      'Evite torniquetes caseiros, pois podem necrosar o membro se mal aplicados.',
      'Mantenha o pet quieto e aquecido a caminho da clínica.'
    ]
  },
  {
    id: 'bites',
    icon: Bug,
    color: 'text-purple-600 bg-purple-50 border-purple-200',
    title: 'Picadas de Inseto, Abelha ou Escorpião',
    urgency: 'Média/Alta — Alergia Súbita',
    symptoms: 'Focinho inchado (edema facial), olho fechado, coceira extrema, uivos de dor ao tocar na pata.',
    steps: [
      'Se for ferrão de abelha visível, raspe com um cartão rígido para retirar (não aperte para não espremer o veneno).',
      'Aplique uma compressa fria ou bolsa de gelo envolvida em pano sobre o inchaço por 10 minutos.',
      'Fique atento a chiados na respiração ou vômitos, que indicam choque anafilático.',
      'Procure auxílio veterinário para administração do antialérgico/corticoide na dosagem correta para o peso.'
    ]
  },
  {
    id: 'snakes',
    icon: Skull,
    color: 'text-emerald-700 bg-emerald-50 border-emerald-200',
    title: 'Acidente com Cobra ou Animal Peçonhento',
    urgency: 'Emergência Máxima — Soro Específico',
    symptoms: 'Marcas de dentes/presas, dor intensa imediata, edema que se espalha, sangramento, fraqueza ou salivação.',
    steps: [
      'Mantenha a calma e impeça o animal de se movimentar (o esforço acelera a propagação da peçonha).',
      'NUNCA faça torniquete, NÃO fure a pele e NÃO tente sugar o veneno com a boca.',
      'Lave a região apenas com água e sabão neutro sem esfregar com força.',
      'Se possível com segurança, fotografe o animal peçonhento para identificação do soro correto pelo veterinário.',
      'Transporte o pet imediatamente ao hospital veterinário mais próximo com urgência.',
      'Em caso de animal perigoso ou cobra ainda solta no imóvel, ligue 193 (Bombeiros) ou IBAMA (0800 61 8080).'
    ]
  }
];

export default function EmergencyModal({ isOpen, onClose, userEmail }: EmergencyModalProps) {
  const [activeTab, setActiveTab] = useState<'guide' | 'triage' | 'vet' | 'wildlife'>('guide');
  const [selectedTopic, setSelectedTopic] = useState<string>('choking');

  // AI Triage & Toxicology Calculator State
  const [triageQuery, setTriageQuery] = useState('');
  const [triageSpecies, setTriageSpecies] = useState<'dog' | 'cat' | 'bird'>('dog');
  const [triageWeightKg, setTriageWeightKg] = useState<string>('8');
  const [triageLoading, setTriageLoading] = useState(false);
  const [triageResult, setTriageResult] = useState<AiTriageResponse | null>(null);

  const handleRunTriage = async (customQuery?: string) => {
    const q = (customQuery ?? triageQuery).trim();
    if (!q) {
      toast.error('Descreva o que o pet ingeriu ou está sentindo.');
      return;
    }
    if (customQuery) setTriageQuery(customQuery);
    setTriageLoading(true);
    try {
      const res = await api.runEmergencyAiTriage({
        query: q,
        petSpecies: triageSpecies,
        weightKg: parseFloat(triageWeightKg) || 8
      });
      setTriageResult(res);
    } catch (err: any) {
      toast.error(err?.message || 'Erro ao executar triagem.');
    } finally {
      setTriageLoading(false);
    }
  };
  
  // Vet Contact State
  const [vetContact, setVetContact] = useState<EmergencyVetContact | null>(null);
  const [isEditingVet, setIsEditingVet] = useState(false);
  const [vetName, setVetName] = useState('');
  const [vetPhone, setVetPhone] = useState('');
  const [vetAddress, setVetAddress] = useState('');
  const [vetCity, setVetCity] = useState('');
  const [vetNotes, setVetNotes] = useState('');
  const [is24Hours, setIs24Hours] = useState(true);
  const [savingVet, setSavingVet] = useState(false);

  useEffect(() => {
    if (isOpen && userEmail) {
      api.fetchEmergencyVet(userEmail).then(contact => {
        if (contact) {
          setVetContact(contact);
          setVetName(contact.name);
          setVetPhone(contact.phone);
          setVetAddress(contact.address);
          setVetCity(contact.city || '');
          setVetNotes(contact.notes || '');
          setIs24Hours(contact.is24Hours ?? true);
        } else {
          setIsEditingVet(false);
        }
      }).catch(() => {});
    }
  }, [isOpen, userEmail]);

  const handleSaveVet = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userEmail) {
      toast.error('Faça login para salvar o contato de emergência.');
      return;
    }
    if (!vetName.trim() || !vetPhone.trim()) {
      toast.error('Informe ao menos o nome e telefone da clínica.');
      return;
    }

    setSavingVet(true);
    try {
      const contact: EmergencyVetContact = {
        name: vetName.trim(),
        phone: vetPhone.trim(),
        address: vetAddress.trim(),
        city: vetCity.trim(),
        notes: vetNotes.trim(),
        is24Hours
      };
      await api.updateEmergencyVet(contact, userEmail);
      setVetContact(contact);
      setIsEditingVet(false);
      toast.success('Clínica de emergência salva com sucesso!');
    } catch (err: any) {
      toast.error('Erro ao salvar: ' + (err.message || 'Falha na conexão'));
    } finally {
      setSavingVet(false);
    }
  };

  if (!isOpen) return null;

  const currentTopic = FIRST_AID_TOPICS.find(t => t.id === selectedTopic) || FIRST_AID_TOPICS[0];

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-xs overflow-y-auto">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 15 }}
          className="bg-white rounded-3xl shadow-2xl border border-red-100 max-w-2xl w-full overflow-hidden flex flex-col max-h-[92vh]"
        >
          {/* Header */}
          <div className="bg-gradient-to-r from-red-600 via-rose-600 to-orange-600 text-white p-5 flex items-center justify-between shrink-0 shadow-md">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-2xl bg-white/20 backdrop-blur-md flex items-center justify-center shadow-inner">
                <ShieldAlert size={24} className="text-white animate-pulse" />
              </div>
              <div>
                <h2 className="text-lg font-black tracking-tight leading-none">Central de Emergência Pet 🚨</h2>
                <p className="text-xs text-red-100 mt-1 font-medium">
                  Primeiros socorros e contato rápido do seu veterinário 24h
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

          {/* Sub Navigation */}
          <div className="flex border-b border-gray-100 bg-gray-50/80 p-2 gap-1.5 shrink-0 overflow-x-auto no-scrollbar">
            <button
              onClick={() => setActiveTab('guide')}
              className={`flex-1 min-w-[125px] py-2 px-3 rounded-xl text-xs font-black transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                activeTab === 'guide'
                  ? 'bg-white text-red-600 shadow-xs border border-red-100'
                  : 'text-gray-500 hover:text-gray-800'
              }`}
            >
              <HeartPulse size={15} />
              <span>Primeiros Socorros</span>
            </button>

            <button
              onClick={() => setActiveTab('triage')}
              className={`flex-1 min-w-[135px] py-2 px-3 rounded-xl text-xs font-black transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                activeTab === 'triage'
                  ? 'bg-white text-[#f08136] shadow-xs border border-orange-200'
                  : 'text-gray-500 hover:text-gray-800'
              }`}
            >
              <Sparkles size={15} />
              <span>Triagem IA & Tóxicos</span>
            </button>

            <button
              onClick={() => setActiveTab('vet')}
              className={`flex-1 min-w-[125px] py-2 px-3 rounded-xl text-xs font-black transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                activeTab === 'vet'
                  ? 'bg-white text-red-600 shadow-xs border border-red-100'
                  : 'text-gray-500 hover:text-gray-800'
              }`}
            >
              <Phone size={15} />
              <span>Meu Veterinário 24h</span>
            </button>

            <button
              onClick={() => setActiveTab('wildlife')}
              className={`flex-1 min-w-[145px] py-2 px-3 rounded-xl text-xs font-black transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                activeTab === 'wildlife'
                  ? 'bg-white text-emerald-700 shadow-xs border border-emerald-200'
                  : 'text-gray-500 hover:text-gray-800'
              }`}
            >
              <span>🐍</span>
              <span>IBAMA / Peçonhentos</span>
            </button>
          </div>

          {/* Modal Body */}
          <div className="p-4 sm:p-6 overflow-y-auto flex-1 space-y-4">
            {activeTab === 'guide' ? (
              <div>
                {/* Horizontal topic selector */}
                <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-none">
                  {FIRST_AID_TOPICS.map(topic => {
                    const Icon = topic.icon;
                    const isSelected = selectedTopic === topic.id;
                    return (
                      <button
                        key={topic.id}
                        onClick={() => setSelectedTopic(topic.id)}
                        className={`px-3 py-2 rounded-xl text-xs font-bold shrink-0 flex items-center gap-1.5 transition-all cursor-pointer border ${
                          isSelected
                            ? 'bg-red-600 text-white border-red-600 shadow-xs'
                            : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'
                        }`}
                      >
                        <Icon size={14} />
                        <span>{topic.title.split(' ')[0]}</span>
                      </button>
                    );
                  })}
                </div>

                {/* Selected Topic Detail Card */}
                <div className="mt-3 bg-red-50/40 border border-red-100 rounded-2xl p-4 sm:p-5">
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div>
                      <span className="text-[10px] font-black uppercase tracking-wider bg-red-100 text-red-700 px-2 py-0.5 rounded-full">
                        {currentTopic.urgency}
                      </span>
                      <h3 className="text-base font-extrabold text-gray-900 mt-1.5">
                        {currentTopic.title}
                      </h3>
                    </div>
                  </div>

                  <div className="bg-white/80 border border-red-100/80 rounded-xl p-3 mb-4">
                    <p className="text-xs text-gray-700">
                      <strong className="text-red-700">⚠️ Como identificar: </strong>
                      {currentTopic.symptoms}
                    </p>
                  </div>

                  <h4 className="text-xs font-black uppercase text-gray-700 tracking-wider mb-2.5">
                    O que fazer passo a passo:
                  </h4>
                  <ol className="space-y-2.5">
                    {currentTopic.steps.map((step, idx) => (
                      <li key={idx} className="flex items-start gap-3 bg-white p-3 rounded-xl border border-gray-100 text-xs font-medium text-gray-800 shadow-2xs">
                        <span className="w-5 h-5 rounded-full bg-red-600 text-white flex items-center justify-center text-[10px] font-black shrink-0 mt-0.5">
                          {idx + 1}
                        </span>
                        <span className="leading-relaxed">{step}</span>
                      </li>
                    ))}
                  </ol>
                </div>

                <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-2xl flex items-start gap-2.5 text-xs text-amber-900">
                  <AlertTriangle size={16} className="text-amber-600 shrink-0 mt-0.5" />
                  <p className="leading-relaxed">
                    <strong>Importante:</strong> Os primeiros socorros estabilizam o animal, mas <strong>não substituem</strong> o atendimento veterinário profissional imediato. Leve o pet para avaliação clínica o quanto antes.
                  </p>
                </div>
              </div>
            ) : activeTab === 'triage' ? (
              <div className="space-y-4">
                <div className="bg-gradient-to-r from-orange-50 via-amber-50 to-red-50 border border-orange-200/80 rounded-2xl p-4">
                  <div className="flex items-center gap-2 mb-1">
                    <Sparkles size={16} className="text-[#f08136]" />
                    <h3 className="text-sm font-black text-slate-900">
                      Assistente de Triagem & Calculadora de Toxicidade (IA)
                    </h3>
                  </div>
                  <p className="text-xs text-slate-600 leading-relaxed">
                    Informe o peso do pet e o que ele ingeriu (ex.: chocolate, uva, remédio humano, veneno) ou os sintomas para calcular a dose tóxica por kg e o protocolo imediato.
                  </p>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-3">
                    {(['dog', 'cat', 'bird'] as const).map((sp) => (
                      <button
                        key={sp}
                        type="button"
                        onClick={() => setTriageSpecies(sp)}
                        className={`py-2 px-3 rounded-xl text-xs font-extrabold border transition-all cursor-pointer ${
                          triageSpecies === sp
                            ? 'bg-slate-900 text-white border-slate-900'
                            : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                        }`}
                      >
                        {sp === 'dog' ? '🐶 Cão' : sp === 'cat' ? '🐱 Gato' : '🦜 Ave'}
                      </button>
                    ))}
                    <div className="relative">
                      <input
                        type="number"
                        step="0.5"
                        min="0.5"
                        value={triageWeightKg}
                        onChange={(e) => setTriageWeightKg(e.target.value)}
                        className="w-full py-2 pl-3 pr-8 bg-white border border-slate-200 rounded-xl text-xs font-black text-slate-900 focus:outline-none focus:border-[#f08136]"
                        placeholder="Peso"
                      />
                      <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] font-black text-slate-400">
                        kg
                      </span>
                    </div>
                  </div>

                  {/* Quick Toxic Presets */}
                  <div className="flex gap-1.5 overflow-x-auto no-scrollbar pt-3 pb-1">
                    {[
                      'Comeu 45g de chocolate amargo',
                      'Comeu chocolate ao leite (30g)',
                      'Ingeriu uvas / passas',
                      'Tomou Paracetamol / Tylenol',
                      'Suspeita de chumbinho / tremores'
                    ].map((preset) => (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => handleRunTriage(preset)}
                        className="px-2.5 py-1.5 rounded-lg bg-white hover:bg-orange-100/60 border border-orange-200/80 text-[11px] font-bold text-slate-700 whitespace-nowrap cursor-pointer transition-all"
                      >
                        ⚡ {preset}
                      </button>
                    ))}
                  </div>

                  <div className="mt-2.5 flex gap-2">
                    <input
                      type="text"
                      value={triageQuery}
                      onChange={(e) => setTriageQuery(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleRunTriage()}
                      placeholder="Ex: Comeu 50g de chocolate meio amargo há 20 minutos..."
                      className="flex-1 bg-white border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs font-medium focus:outline-none focus:border-[#f08136]"
                    />
                    <button
                      type="button"
                      onClick={() => handleRunTriage()}
                      disabled={triageLoading}
                      className="px-4 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-black shrink-0 cursor-pointer shadow-sm disabled:opacity-60"
                    >
                      {triageLoading ? 'Calculando...' : 'Avaliar'}
                    </button>
                  </div>
                </div>

                {triageResult && (
                  <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="bg-white border-2 border-red-200 rounded-2xl p-4 sm:p-5 space-y-3 shadow-sm"
                  >
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <span
                        className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider ${
                          triageResult.urgencyLevel === 'critica'
                            ? 'bg-red-600 text-white'
                            : triageResult.urgencyLevel === 'alta'
                            ? 'bg-orange-500 text-white'
                            : 'bg-amber-100 text-amber-900'
                        }`}
                      >
                        Urgência: {triageResult.urgencyLevel.toUpperCase()}
                      </span>
                      <span className="text-[10px] font-bold text-slate-400 uppercase">
                        Motor Clínico {triageResult.source === 'gemini' ? '• Gemini AI' : '• Toxicologia Vet'}
                      </span>
                    </div>

                    <h4 className="text-base font-black text-slate-900">{triageResult.title}</h4>
                    <p className="text-xs text-slate-700 leading-relaxed bg-slate-50 p-3 rounded-xl border border-slate-100">
                      {triageResult.summary}
                    </p>

                    <div>
                      <p className="text-xs font-black uppercase text-slate-700 mb-2">
                        ✅ Conduta Imediata:
                      </p>
                      <ol className="space-y-1.5">
                        {triageResult.immediateSteps.map((st, i) => (
                          <li key={i} className="text-xs text-slate-800 flex items-start gap-2">
                            <span className="w-4 h-4 rounded-full bg-emerald-600 text-white text-[10px] font-black flex items-center justify-center shrink-0 mt-0.5">
                              {i + 1}
                            </span>
                            <span>{st}</span>
                          </li>
                        ))}
                      </ol>
                    </div>

                    {triageResult.warnings?.length > 0 && (
                      <div className="p-3 rounded-xl bg-red-50 border border-red-200 space-y-1">
                        <p className="text-xs font-black text-red-800">🚫 O que NÃO fazer:</p>
                        {triageResult.warnings.map((w, i) => (
                          <p key={i} className="text-xs text-red-700">
                            • {w}
                          </p>
                        ))}
                      </div>
                    )}

                    <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs font-bold text-amber-950">
                      🏥 {triageResult.vetRecommendation}
                    </div>
                  </motion.div>
                )}
              </div>
            ) : activeTab === 'vet' ? (
              <div>
                {/* Vet Contact Section */}
                {vetContact && !isEditingVet ? (
                  <div className="bg-gradient-to-br from-gray-50 to-orange-50/40 border border-orange-100 rounded-3xl p-5 shadow-2xs">
                    <div className="flex items-start justify-between gap-3 mb-4">
                      <div className="flex items-center gap-3">
                        <div className="w-12 h-12 rounded-2xl bg-[#f08136] text-white flex items-center justify-center shadow-md shadow-[#f08136]/20">
                          <Phone size={22} className="stroke-[2.5]" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <h3 className="text-base font-extrabold text-gray-900">{vetContact.name}</h3>
                            {vetContact.is24Hours && (
                              <span className="bg-emerald-100 text-emerald-700 text-[10px] font-black px-2 py-0.5 rounded-full uppercase">
                                24 Horas
                              </span>
                            )}
                          </div>
                          {vetContact.city && (
                            <p className="text-xs text-gray-500 font-medium">{vetContact.city}</p>
                          )}
                        </div>
                      </div>

                      <button
                        onClick={() => setIsEditingVet(true)}
                        className="p-2 rounded-xl text-gray-500 hover:text-gray-800 hover:bg-white transition-all cursor-pointer"
                        title="Editar Contato"
                      >
                        <Edit2 size={16} />
                      </button>
                    </div>

                    {vetContact.address && (
                      <div className="flex items-center gap-2 text-xs text-gray-600 mb-3 bg-white/80 p-2.5 rounded-xl border border-gray-100">
                        <MapPin size={14} className="text-red-500 shrink-0" />
                        <span className="truncate">{vetContact.address}</span>
                      </div>
                    )}

                    {vetContact.notes && (
                      <p className="text-xs text-gray-500 italic mb-4 bg-white/60 p-2.5 rounded-xl">
                        "{vetContact.notes}"
                      </p>
                    )}

                    {/* Action buttons */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-2">
                      <a
                        href={`tel:${vetContact.phone.replace(/[^0-9+]/g, '')}`}
                        className="py-3 px-4 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-black flex items-center justify-center gap-2 shadow-sm active:scale-95 transition-all text-center"
                      >
                        <Phone size={15} />
                        <span>Ligar Agora ({vetContact.phone})</span>
                      </a>

                      {vetContact.address ? (
                        <a
                          href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(vetContact.name + ' ' + vetContact.address)}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="py-3 px-4 bg-white hover:bg-gray-50 border border-gray-200 text-gray-800 rounded-xl text-xs font-black flex items-center justify-center gap-2 shadow-2xs active:scale-95 transition-all text-center"
                        >
                          <MapPin size={15} className="text-red-600" />
                          <span>Abrir no GPS / Maps</span>
                          <ExternalLink size={12} className="text-gray-400" />
                        </a>
                      ) : (
                        <button
                          onClick={() => setIsEditingVet(true)}
                          className="py-3 px-4 bg-white border border-gray-200 text-gray-700 rounded-xl text-xs font-bold hover:bg-gray-50 transition-all"
                        >
                          Adicionar Endereço
                        </button>
                      )}
                    </div>
                  </div>
                ) : (
                  <form onSubmit={handleSaveVet} className="space-y-3 bg-gray-50 p-4 sm:p-5 rounded-2xl border border-gray-200">
                    <div className="flex items-center justify-between mb-1">
                      <h3 className="text-xs font-black text-gray-800 uppercase tracking-wider">
                        {vetContact ? 'Editar Clínica de Emergência' : 'Cadastrar Clínica de Emergência'}
                      </h3>
                      {vetContact && (
                        <button
                          type="button"
                          onClick={() => setIsEditingVet(false)}
                          className="text-xs text-gray-500 hover:text-gray-700 font-bold cursor-pointer"
                        >
                          Cancelar
                        </button>
                      )}
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-gray-700 mb-1">Nome da Clínica / Hospital *</label>
                      <input
                        type="text"
                        value={vetName}
                        onChange={e => setVetName(e.target.value)}
                        placeholder="Ex: Hospital Veterinário Santa Mônica 24h"
                        className="w-full px-3.5 py-2.5 bg-white border border-gray-200 rounded-xl text-xs font-medium focus:ring-2 focus:ring-red-500/20 focus:border-red-500 outline-none"
                        required
                      />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-bold text-gray-700 mb-1">Telefone / Plantão 24h *</label>
                        <input
                          type="text"
                          value={vetPhone}
                          onChange={e => setVetPhone(e.target.value)}
                          placeholder="(11) 99999-8888"
                          className="w-full px-3.5 py-2.5 bg-white border border-gray-200 rounded-xl text-xs font-medium focus:ring-2 focus:ring-red-500/20 focus:border-red-500 outline-none"
                          required
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-gray-700 mb-1">Cidade</label>
                        <input
                          type="text"
                          value={vetCity}
                          onChange={e => setVetCity(e.target.value)}
                          placeholder="São Paulo"
                          className="w-full px-3.5 py-2.5 bg-white border border-gray-200 rounded-xl text-xs font-medium focus:ring-2 focus:ring-red-500/20 focus:border-red-500 outline-none"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-gray-700 mb-1">Endereço Completo (para abrir rota no GPS)</label>
                      <input
                        type="text"
                        value={vetAddress}
                        onChange={e => setVetAddress(e.target.value)}
                        placeholder="Rua das Flores, 123 - Bairro"
                        className="w-full px-3.5 py-2.5 bg-white border border-gray-200 rounded-xl text-xs font-medium focus:ring-2 focus:ring-red-500/20 focus:border-red-500 outline-none"
                      />
                    </div>

                    <div className="flex items-center gap-2 pt-1">
                      <input
                        type="checkbox"
                        id="is24h"
                        checked={is24Hours}
                        onChange={e => setIs24Hours(e.target.checked)}
                        className="rounded text-red-600 focus:ring-red-500"
                      />
                      <label htmlFor="is24h" className="text-xs font-bold text-gray-700 cursor-pointer">
                        Atendimento com Plantão 24 Horas
                      </label>
                    </div>

                    <button
                      type="submit"
                      disabled={savingVet}
                      className="w-full py-3 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white rounded-xl text-xs font-black transition-all shadow-xs cursor-pointer active:scale-98 flex items-center justify-center gap-2"
                    >
                      <Save size={14} />
                      <span>{savingVet ? 'Salvando...' : 'Salvar Contato de Emergência'}</span>
                    </button>
                  </form>
                )}
              </div>
            ) : (
              /* Wildlife, Venomous & Dangerous Animals Contacts */
              <div className="space-y-4">
                <div className="bg-emerald-50/70 border border-emerald-200 rounded-2xl p-4">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xl">🌿</span>
                    <h3 className="text-sm font-black text-emerald-900">
                      Resgate de Fauna, Animais Peçonhentos e Silvestres
                    </h3>
                  </div>
                  <p className="text-xs text-emerald-800 leading-relaxed">
                    Caso encontre cobras, escorpiões, aranhas perigosas, abelhas ou animais silvestres feridos ou em área urbana, utilize os contatos oficiais de resgate e emergência toxicológica:
                  </p>
                </div>

                <div className="space-y-3">
                  {/* IBAMA Card */}
                  <div className="bg-white border border-gray-200 rounded-2xl p-4 shadow-2xs hover:border-emerald-300 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-800 flex items-center justify-center font-black text-sm shrink-0">
                        IBAMA
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h4 className="font-extrabold text-gray-900 text-sm">IBAMA — Linha Verde Oficial</h4>
                          <span className="bg-emerald-100 text-emerald-800 text-[10px] font-bold px-2 py-0.5 rounded-full">Gratuito</span>
                        </div>
                        <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">
                          Orientação sobre resgate de animais silvestres, espécies nativas e denúncias.
                        </p>
                        <p className="text-xs font-mono font-bold text-gray-700 mt-1">📞 0800 61 8080</p>
                      </div>
                    </div>
                    <a
                      href="tel:0800618080"
                      className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-xs active:scale-95 transition-all text-center shrink-0"
                    >
                      <Phone size={14} />
                      <span>Ligar para IBAMA</span>
                    </a>
                  </div>

                  {/* Bombeiros / Polícia Ambiental */}
                  <div className="bg-white border border-gray-200 rounded-2xl p-4 shadow-2xs hover:border-red-300 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 rounded-xl bg-red-100 text-red-700 flex items-center justify-center font-black text-sm shrink-0">
                        193
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h4 className="font-extrabold text-gray-900 text-sm">Corpo de Bombeiros / Polícia Militar Ambiental</h4>
                          <span className="bg-red-100 text-red-700 text-[10px] font-bold px-2 py-0.5 rounded-full">24 Horas</span>
                        </div>
                        <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">
                          Captura e remoção segura de cobras, enxames de abelhas ou animais perigosos em residências e vias.
                        </p>
                        <p className="text-xs font-mono font-bold text-gray-700 mt-1">📞 193</p>
                      </div>
                    </div>
                    <a
                      href="tel:193"
                      className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-bold shadow-xs active:scale-95 transition-all text-center shrink-0"
                    >
                      <Phone size={14} />
                      <span>Ligar 193 (Emergência)</span>
                    </a>
                  </div>

                  {/* CIATox Card */}
                  <div className="bg-white border border-gray-200 rounded-2xl p-4 shadow-2xs hover:border-purple-300 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 rounded-xl bg-purple-100 text-purple-700 flex items-center justify-center font-black text-sm shrink-0">
                        CIATox
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h4 className="font-extrabold text-gray-900 text-sm">Disque-Intoxicação (Anvisa / CIATox)</h4>
                          <span className="bg-purple-100 text-purple-800 text-[10px] font-bold px-2 py-0.5 rounded-full">24 Horas</span>
                        </div>
                        <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">
                          Centro de Informações Toxicológicas: orientação imediata sobre picadas de escorpião, aranha, cobra ou ingestão de veneno.
                        </p>
                        <p className="text-xs font-mono font-bold text-gray-700 mt-1">📞 0800 722 6001</p>
                      </div>
                    </div>
                    <a
                      href="tel:08007226001"
                      className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-xs font-bold shadow-xs active:scale-95 transition-all text-center shrink-0"
                    >
                      <Phone size={14} />
                      <span>Ligar CIATox</span>
                    </a>
                  </div>

                  {/* SAMU Card */}
                  <div className="bg-white border border-gray-200 rounded-2xl p-4 shadow-2xs hover:border-amber-300 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-800 flex items-center justify-center font-black text-sm shrink-0">
                        192
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h4 className="font-extrabold text-gray-900 text-sm">SAMU — Atendimento Humano</h4>
                          <span className="bg-amber-100 text-amber-800 text-[10px] font-bold px-2 py-0.5 rounded-full">24 Horas</span>
                        </div>
                        <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">
                          Caso algum tutor, criança ou pessoa também tenha sido picada ou ferida pelo animal peçonhento.
                        </p>
                        <p className="text-xs font-mono font-bold text-gray-700 mt-1">📞 192</p>
                      </div>
                    </div>
                    <a
                      href="tel:192"
                      className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold shadow-xs active:scale-95 transition-all text-center shrink-0"
                    >
                      <Phone size={14} />
                      <span>Ligar 192 (SAMU)</span>
                    </a>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="bg-gray-50 px-5 py-3 border-t border-gray-100 flex items-center justify-between shrink-0 text-xs text-gray-500">
            <span>UniãoPet • Cuidado com quem te ama</span>
            <button
              onClick={onClose}
              className="px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-800 rounded-xl text-xs font-bold cursor-pointer transition-all"
            >
              Fechar
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
