import React, { useState, useEffect, useMemo } from 'react';
import { PetRecord, VaccineRecord, VaccineType, UserProfile, PetSpecies } from '../types';
import * as api from '../lib/apiService';
import { formatDateSafely } from '../lib/dateUtils';
import { 
  Syringe, 
  Plus, 
  Calendar, 
  ShieldCheck, 
  Clock, 
  Trash2, 
  Sparkles, 
  Pill, 
  Stethoscope, 
  Printer, 
  X, 
  Camera,
  Scale,
  CheckCircle2,
  QrCode,
  CalendarPlus,
  ScanLine,
  TrendingUp
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import toast from 'react-hot-toast';
import { compressImageFile } from '../lib/imageCompressor';
import { exportVaccineToCalendar, downloadCalendarIcs, getQrCodeImageUrl, getPetRescueLink } from '../lib/petUtils';
import PetRescueModal from './PetRescueModal';

interface VaccinationBookletProps {
  currentUser: UserProfile;
}

export default function VaccinationBooklet({ currentUser }: VaccinationBookletProps) {
  const [pets, setPets] = useState<PetRecord[]>([]);
  const [selectedPetId, setSelectedPetId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'vacina' | 'vermifugo' | 'consulta' | 'medicamentos' | 'peso'>('vacina');
  const [statusFilter, setStatusFilter] = useState<'todos' | 'em_dia' | 'proximo' | 'atrasado'>('todos');
  const [loading, setLoading] = useState(true);

  // Modals
  const [isAddPetModalOpen, setIsAddPetModalOpen] = useState(false);
  const [isAddVaccineModalOpen, setIsAddVaccineModalOpen] = useState(false);
  const [isPrintModalOpen, setIsPrintModalOpen] = useState(false);
  const [isAddMedModalOpen, setIsAddMedModalOpen] = useState(false);
  const [isAddWeightModalOpen, setIsAddWeightModalOpen] = useState(false);
  const [isRgModalOpen, setIsRgModalOpen] = useState(false);
  const [scanningVaccine, setScanningVaccine] = useState(false);

  // Pet Form State
  const [newPetName, setNewPetName] = useState('');
  const [newPetSpecies, setNewPetSpecies] = useState<PetSpecies>('dog');
  const [newPetBreed, setNewPetBreed] = useState('');
  const [newPetGender, setNewPetGender] = useState<'macho' | 'femea'>('macho');
  const [newPetBirthDate, setNewPetBirthDate] = useState('');
  const [newPetWeight, setNewPetWeight] = useState('');
  const [newPetMicrochip, setNewPetMicrochip] = useState('');
  const [newPetAvatar, setNewPetAvatar] = useState('');

  // Vaccine Form State
  const [newVacName, setNewVacName] = useState('');
  const [newVacType, setNewVacType] = useState<VaccineType>('vacina');
  const [newVacDateApplied, setNewVacDateApplied] = useState(new Date().toISOString().split('T')[0]);
  const [newVacNextDue, setNewVacNextDue] = useState('');
  const [newVacVet, setNewVacVet] = useState('');
  const [newVacClinic, setNewVacClinic] = useState('');
  const [newVacBatch, setNewVacBatch] = useState('');
  const [newVacNotes, setNewVacNotes] = useState('');

  // Medication Form State
  const [newMedName, setNewMedName] = useState('');
  const [newMedDosage, setNewMedDosage] = useState('');
  const [newMedFrequency, setNewMedFrequency] = useState('1x ao dia');
  const [newMedStartDate, setNewMedStartDate] = useState(new Date().toISOString().split('T')[0]);
  const [newMedEndDate, setNewMedEndDate] = useState('');
  const [newMedNotes, setNewMedNotes] = useState('');

  // Weight Form State
  const [newWeightKg, setNewWeightKg] = useState('');
  const [newWeightDate, setNewWeightDate] = useState(new Date().toISOString().split('T')[0]);
  const [newWeightNotes, setNewWeightNotes] = useState('');

  // Load pets from backend
  const loadPets = async () => {
    try {
      setLoading(true);
      const data = await api.fetchPets(currentUser.email);
      setPets(data);
      if (data.length > 0 && !selectedPetId) {
        setSelectedPetId(data[0].id);
      }
    } catch (err) {
      console.error('Failed to load pets:', err);
      const local = localStorage.getItem(`uniao_pet_pets_${currentUser.email}`);
      if (local) {
        try {
          const parsed = JSON.parse(local);
          setPets(parsed);
          if (parsed.length > 0 && !selectedPetId) setSelectedPetId(parsed[0].id);
        } catch (_) {}
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPets();
  }, [currentUser.email]);

  // Selected Pet object
  const selectedPet = useMemo(() => {
    return pets.find(p => p.id === selectedPetId) || pets[0] || null;
  }, [pets, selectedPetId]);

  // Calculate vaccine status
  const getVaccineStatus = (appliedDate: string, nextDueDate?: string): { status: 'em_dia' | 'proximo' | 'atrasado'; label: string; color: string; daysDiff?: number } => {
    if (!nextDueDate) return { status: 'em_dia', label: 'Aplicada', color: 'emerald' };

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const due = new Date(nextDueDate);
    due.setHours(0, 0, 0, 0);

    const diffTime = due.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays < 0) {
      return { status: 'atrasado', label: `Atrasada (${Math.abs(diffDays)}d)`, color: 'red', daysDiff: diffDays };
    } else if (diffDays <= 30) {
      return { status: 'proximo', label: `Vence em ${diffDays}d`, color: 'amber', daysDiff: diffDays };
    } else {
      return { status: 'em_dia', label: `Em dia (${diffDays}d)`, color: 'emerald', daysDiff: diffDays };
    }
  };

  // Filtered records for current pet and active tab
  const currentRecords = useMemo(() => {
    if (!selectedPet || !selectedPet.vaccines) return [];
    
    return selectedPet.vaccines
      .filter(v => {
        if (activeTab === 'vacina') return v.type === 'vacina';
        if (activeTab === 'vermifugo') return v.type === 'vermifugo' || v.type === 'antipulgas';
        return v.type === 'consulta';
      })
      .filter(v => {
        if (statusFilter === 'todos') return true;
        const calc = getVaccineStatus(v.dateApplied, v.nextDueDate);
        return calc.status === statusFilter;
      })
      .sort((a, b) => new Date(b.dateApplied).getTime() - new Date(a.dateApplied).getTime());
  }, [selectedPet, activeTab, statusFilter]);

  // Pet summary stats
  const petStats = useMemo(() => {
    if (!selectedPet || !selectedPet.vaccines) return { total: 0, upToDate: 0, upcoming: 0, overdue: 0, healthRate: 100 };
    const vacs = selectedPet.vaccines;
    let upToDate = 0;
    let upcoming = 0;
    let overdue = 0;

    vacs.forEach(v => {
      const s = getVaccineStatus(v.dateApplied, v.nextDueDate);
      if (s.status === 'em_dia') upToDate++;
      else if (s.status === 'proximo') upcoming++;
      else if (s.status === 'atrasado') overdue++;
    });

    const total = vacs.length;
    const healthRate = total > 0 ? Math.round(((upToDate + upcoming) / total) * 100) : 100;
    return { total, upToDate, upcoming, overdue, healthRate };
  }, [selectedPet]);

  // Handle Photo upload with compression
  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>, setter: (val: string) => void) => {
    const file = e.target.files?.[0];
    if (file) {
      try {
        const compressed = await compressImageFile(file, { maxWidth: 600, maxHeight: 600, quality: 0.8 });
        setter(compressed);
      } catch (err: any) {
        toast.error(err?.message || 'Erro ao processar imagem');
      }
    }
  };

  // AI OCR Scanner for Vaccine Label Photo
  const handleScanVaccineWithAi = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setScanningVaccine(true);
    const toastId = toast.loading('✨ Lendo selo da vacina com IA...');
    try {
      const compressed = await compressImageFile(file, { maxWidth: 1000, maxHeight: 1000, quality: 0.82 });
      const extracted = await api.scanVaccineLabelWithAi(compressed, selectedPet?.species);
      if (extracted.name) setNewVacName(extracted.name);
      if (extracted.type) setNewVacType(extracted.type);
      if (extracted.dateApplied) setNewVacDateApplied(extracted.dateApplied);
      if (extracted.nextDueDate) setNewVacNextDue(extracted.nextDueDate);
      if (extracted.veterinarian) setNewVacVet(extracted.veterinarian);
      if (extracted.clinic) setNewVacClinic(extracted.clinic);
      if (extracted.batch) setNewVacBatch(extracted.batch);
      if (extracted.notes) setNewVacNotes(extracted.notes);
      toast.success('Selo lido! Confira os campos preenchidos automaticamente 🐾', { id: toastId });
    } catch (err: any) {
      toast.error(err?.message || 'Não foi possível ler a imagem.', { id: toastId });
    } finally {
      setScanningVaccine(false);
      e.target.value = '';
    }
  };

  // Add Pet
  const handleCreatePet = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPetName.trim()) {
      toast.error('Informe o nome do pet');
      return;
    }

    const defaultAvatar = newPetSpecies === 'cat'
      ? 'https://images.unsplash.com/photo-1543852786-1cf6624b9987?auto=format&fit=crop&q=80&w=300'
      : newPetSpecies === 'bird'
      ? 'https://images.unsplash.com/photo-1552728089-57bdde30beb3?auto=format&fit=crop&q=80&w=300'
      : 'https://images.unsplash.com/photo-1548767797-d8c844163c4c?auto=format&fit=crop&q=80&w=300';

    const petPayload = {
      name: newPetName.trim(),
      species: newPetSpecies,
      breed: newPetBreed.trim() || 'Sem raça definida (SRD)',
      birthDate: newPetBirthDate,
      gender: newPetGender,
      weight: newPetWeight.trim(),
      avatar: newPetAvatar || defaultAvatar,
      microchip: newPetMicrochip.trim(),
      notes: ''
    };

    try {
      const created = await api.createPet(petPayload, currentUser.email);
      setPets(prev => [created, ...prev]);
      setSelectedPetId(created.id);
      toast.success(`🎉 ${created.name} foi adicionado à caderneta!`);
      setIsAddPetModalOpen(false);
      resetPetForm();
    } catch (err) {
      console.error(err);
      toast.error('Erro ao adicionar pet');
    }
  };

  const resetPetForm = () => {
    setNewPetName('');
    setNewPetSpecies('dog');
    setNewPetBreed('');
    setNewPetGender('macho');
    setNewPetBirthDate('');
    setNewPetWeight('');
    setNewPetMicrochip('');
    setNewPetAvatar('');
  };

  // Delete Pet
  const handleDeletePet = async (petId: string, petName: string) => {
    if (!window.confirm(`Tem certeza que deseja remover o pet "${petName}" e todo seu histórico de saúde?`)) return;
    try {
      await api.deletePet(petId, currentUser.email);
      setPets(prev => prev.filter(p => p.id !== petId));
      if (selectedPetId === petId) {
        const remaining = pets.filter(p => p.id !== petId);
        setSelectedPetId(remaining[0]?.id || null);
      }
      toast.success('Pet removido.');
    } catch (err) {
      toast.error('Erro ao remover pet');
    }
  };

  // Add Vaccine
  const handleAddVaccine = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPet) return;
    if (!newVacName.trim() || !newVacDateApplied) {
      toast.error('Preencha o nome e a data de aplicação.');
      return;
    }

    const vacPayload: Omit<VaccineRecord, 'id'> = {
      name: newVacName.trim(),
      type: newVacType,
      dateApplied: newVacDateApplied,
      nextDueDate: newVacNextDue || undefined,
      veterinarian: newVacVet.trim() || undefined,
      clinic: newVacClinic.trim() || undefined,
      batch: newVacBatch.trim() || undefined,
      notes: newVacNotes.trim() || undefined
    };

    try {
      const created = await api.addVaccine(selectedPet.id, vacPayload, currentUser.email);
      setPets(prev => prev.map(p => {
        if (p.id !== selectedPet.id) return p;
        return {
          ...p,
          vaccines: [...(p.vaccines || []), created]
        };
      }));
      toast.success('Registro de saúde salvo com sucesso! 💉');
      setIsAddVaccineModalOpen(false);
      resetVaccineForm();
    } catch (err) {
      toast.error('Erro ao adicionar registro');
    }
  };

  const resetVaccineForm = () => {
    setNewVacName('');
    setNewVacType('vacina');
    setNewVacDateApplied(new Date().toISOString().split('T')[0]);
    setNewVacNextDue('');
    setNewVacVet('');
    setNewVacClinic('');
    setNewVacBatch('');
    setNewVacNotes('');
  };

  // Quick preset loader
  const handleQuickAddPreset = (presetName: string, type: VaccineType, monthsToNextDue: number = 12) => {
    setNewVacName(presetName);
    setNewVacType(type);
    const today = new Date();
    setNewVacDateApplied(today.toISOString().split('T')[0]);
    
    if (monthsToNextDue > 0) {
      const next = new Date(today);
      next.setMonth(next.getMonth() + monthsToNextDue);
      setNewVacNextDue(next.toISOString().split('T')[0]);
    } else {
      setNewVacNextDue('');
    }
    setIsAddVaccineModalOpen(true);
  };

  // Delete Vaccine
  const handleDeleteVaccine = async (vaccineId: string) => {
    if (!selectedPet) return;
    if (!window.confirm('Excluir este registro de vacina/saúde?')) return;
    try {
      await api.deleteVaccine(selectedPet.id, vaccineId, currentUser.email);
      setPets(prev => prev.map(p => {
        if (p.id !== selectedPet.id) return p;
        return {
          ...p,
          vaccines: (p.vaccines || []).filter(v => v.id !== vaccineId)
        };
      }));
      toast.success('Registro removido.');
    } catch (err) {
      toast.error('Erro ao remover registro.');
    }
  };

  // Medication Handlers
  const handleCreateMedication = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPet) return;
    if (!newMedName.trim() || !newMedDosage.trim()) {
      toast.error('Informe o nome e dosagem do medicamento');
      return;
    }

    const payload = {
      name: newMedName.trim(),
      dosage: newMedDosage.trim(),
      frequency: newMedFrequency.trim(),
      startDate: newMedStartDate,
      endDate: newMedEndDate.trim() || undefined,
      notes: newMedNotes.trim() || undefined,
      active: true
    };

    try {
      const created = await api.addMedication(selectedPet.id, payload, currentUser.email);
      setPets(prev => prev.map(p => {
        if (p.id !== selectedPet.id) return p;
        return {
          ...p,
          medications: [...(p.medications || []), created]
        };
      }));
      toast.success(`💊 Medicamento "${created.name}" cadastrado!`);
      setIsAddMedModalOpen(false);
      resetMedForm();
    } catch (err) {
      toast.error('Erro ao cadastrar medicamento');
    }
  };

  const handleToggleMedTaken = async (medId: string) => {
    if (!selectedPet) return;
    const todayStr = new Date().toISOString().split('T')[0];
    try {
      const updated = await api.toggleMedicationTaken(selectedPet.id, medId, currentUser.email);
      setPets(prev => prev.map(p => {
        if (p.id !== selectedPet.id) return p;
        return {
          ...p,
          medications: (p.medications || []).map(m => {
            if (m.id !== medId) return m;
            const updatedDates = updated?.takenDates || m.takenDates || [];
            const isTaken = updatedDates.includes(todayStr);
            return {
              ...m,
              ...updated,
              takenDates: updatedDates,
              lastTakenDate: isTaken ? todayStr : (m.lastTakenDate === todayStr ? undefined : m.lastTakenDate)
            };
          })
        };
      }));
      toast.success('Dose diária registrada com sucesso! ✅🐾');
    } catch (err) {
      toast.error('Erro ao registrar dose');
    }
  };

  const handleDeleteMedication = async (medId: string) => {
    if (!selectedPet) return;
    if (!window.confirm('Excluir este medicamento?')) return;
    try {
      await api.deleteMedication(selectedPet.id, medId, currentUser.email);
      setPets(prev => prev.map(p => {
        if (p.id !== selectedPet.id) return p;
        return {
          ...p,
          medications: (p.medications || []).filter(m => m.id !== medId)
        };
      }));
      toast.success('Medicamento removido.');
    } catch (err) {
      toast.error('Erro ao remover medicamento');
    }
  };

  const resetMedForm = () => {
    setNewMedName('');
    setNewMedDosage('');
    setNewMedFrequency('1x ao dia');
    setNewMedStartDate(new Date().toISOString().split('T')[0]);
    setNewMedEndDate('');
    setNewMedNotes('');
  };

  // Weight Handlers
  const handleCreateWeight = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPet) return;
    const num = parseFloat(newWeightKg);
    if (isNaN(num) || num <= 0) {
      toast.error('Informe um peso válido em kg (ex: 14.2)');
      return;
    }

    try {
      const created = await api.addWeightRecord(selectedPet.id, {
        date: newWeightDate,
        weightKg: num,
        notes: newWeightNotes.trim() || undefined
      }, currentUser.email);

      setPets(prev => prev.map(p => {
        if (p.id !== selectedPet.id) return p;
        return {
          ...p,
          weight: `${num} kg`,
          weightHistory: [created, ...(p.weightHistory || [])]
        };
      }));
      toast.success(`⚖️ Peso de ${num} kg registrado com sucesso!`);
      setIsAddWeightModalOpen(false);
      resetWeightForm();
    } catch (err) {
      toast.error('Erro ao registrar peso');
    }
  };

  const handleDeleteWeight = async (weightId: string) => {
    if (!selectedPet) return;
    if (!window.confirm('Excluir este registro de peso?')) return;
    try {
      await api.deleteWeightRecord(selectedPet.id, weightId, currentUser.email);
      setPets(prev => prev.map(p => {
        if (p.id !== selectedPet.id) return p;
        return {
          ...p,
          weightHistory: (p.weightHistory || []).filter(w => w.id !== weightId)
        };
      }));
      toast.success('Registro de peso removido.');
    } catch (err) {
      toast.error('Erro ao remover peso');
    }
  };

  const resetWeightForm = () => {
    setNewWeightKg('');
    setNewWeightDate(new Date().toISOString().split('T')[0]);
    setNewWeightNotes('');
  };

  // Quick date helper (+30d, +6m, +1y)
  const setNextDueDatePreset = (daysOrMonths: { days?: number; months?: number }) => {
    const base = newVacDateApplied ? new Date(newVacDateApplied) : new Date();
    if (daysOrMonths.days) base.setDate(base.getDate() + daysOrMonths.days);
    if (daysOrMonths.months) base.setMonth(base.getMonth() + daysOrMonths.months);
    setNewVacNextDue(base.toISOString().split('T')[0]);
  };

  return (
    <div className="pb-24 max-w-4xl mx-auto px-4 pt-5">

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-2 rounded-2xl bg-amber-100 text-[#f08136] shadow-xs">
              <Syringe size={22} className="stroke-[2.5]" />
            </span>
            <h1 className="text-2xl font-extrabold text-gray-800 tracking-tight">Caderneta de Vacinação</h1>
          </div>
          <p className="text-xs text-gray-500 font-medium mt-1">
            Passaporte e carteirinha de saúde digital para todos os seus pets 🐾
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {selectedPet && (
            <>
              <button
                onClick={() => setIsRgModalOpen(true)}
                className="flex items-center gap-2 px-3.5 py-2.5 rounded-2xl bg-slate-900 text-white text-xs font-bold hover:bg-black transition-all shadow-sm cursor-pointer"
                title="Abrir RG Digital e Pingente QR Code para Coleira"
              >
                <QrCode size={15} className="text-[#f08136]" />
                <span>RG & Coleira QR</span>
              </button>

              <button
                onClick={() => setIsPrintModalOpen(true)}
                className="flex items-center gap-2 px-3.5 py-2.5 rounded-2xl bg-white border border-gray-200 text-gray-700 text-xs font-bold hover:bg-gray-50 transition-all shadow-2xs cursor-pointer"
                title="Visualizar e Imprimir Carteirinha"
              >
                <Printer size={16} className="text-[#f08136]" />
                <span>Carteirinha</span>
              </button>
            </>
          )}

          <button
            onClick={() => setIsAddPetModalOpen(true)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-[#f08136] text-white text-xs font-bold hover:bg-[#e07126] transition-all shadow-md shadow-[#f08136]/20 active:scale-95 cursor-pointer"
          >
            <Plus size={16} strokeWidth={3} />
            <span>+ Novo Pet</span>
          </button>
        </div>
      </div>

      {/* Pet Selector Tabs / Carrossel */}
      {pets.length > 0 && (
        <div className="mb-6">
          <div className="flex items-center gap-3 overflow-x-auto pb-2 scrollbar-hide">
            {pets.map(pet => {
              const isSelected = selectedPet?.id === pet.id;
              const speciesEmoji = pet.species === 'cat' ? '🐱' : pet.species === 'bird' ? '🦜' : '🐶';
              return (
                <button
                  key={pet.id}
                  onClick={() => setSelectedPetId(pet.id)}
                  className={`flex items-center gap-3 px-4 py-3 rounded-2xl transition-all cursor-pointer shrink-0 border ${
                    isSelected
                      ? 'bg-white border-[#f08136] shadow-md shadow-[#f08136]/10 ring-2 ring-[#f08136]/20'
                      : 'bg-white/80 border-gray-100 hover:border-gray-200 text-gray-600 hover:bg-white'
                  }`}
                >
                  <div className="relative">
                    <img
                      src={pet.avatar || 'https://images.unsplash.com/photo-1548767797-d8c844163c4c?auto=format&fit=crop&q=80&w=150'}
                      alt={pet.name}
                      className="w-10 h-10 rounded-full object-cover border-2 border-white shadow-xs"
                      referrerPolicy="no-referrer"
                    />
                    <span className="absolute -bottom-1 -right-1 text-[11px] leading-none">
                      {speciesEmoji}
                    </span>
                  </div>
                  <div className="text-left">
                    <p className={`text-sm font-extrabold leading-tight ${isSelected ? 'text-[#f08136]' : 'text-gray-800'}`}>
                      {pet.name}
                    </p>
                    <p className="text-[10px] text-gray-400 font-medium truncate max-w-[90px]">
                      {pet.breed || 'SRD'}
                    </p>
                  </div>
                </button>
              );
            })}

            <button
              onClick={() => setIsAddPetModalOpen(true)}
              className="flex items-center gap-2 px-4 py-3 rounded-2xl border-2 border-dashed border-gray-200 hover:border-[#f08136] text-gray-400 hover:text-[#f08136] transition-all cursor-pointer shrink-0 text-xs font-bold"
            >
              <Plus size={16} />
              <span>Adicionar Pet</span>
            </button>
          </div>
        </div>
      )}

      {/* Main Content Area */}
      {loading ? (
        <div className="text-center py-16 bg-white rounded-3xl border border-gray-100 p-8">
          <div className="w-12 h-12 border-3 border-[#f08136] border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-sm font-bold text-gray-600">Carregando caderneta pet...</p>
        </div>
      ) : pets.length === 0 ? (
        /* Empty State: No Pets Yet */
        <div className="bg-white rounded-[2.5rem] border border-gray-100 p-8 sm:p-12 text-center shadow-xs">
          <div className="w-24 h-24 rounded-full bg-orange-50 text-[#f08136] flex items-center justify-center mx-auto mb-5 shadow-inner">
            <span className="text-4xl">🐾</span>
          </div>
          <h2 className="text-xl sm:text-2xl font-black text-gray-800 mb-2">Nenhum pet cadastrado</h2>
          <p className="text-gray-500 text-sm max-w-md mx-auto mb-6 leading-relaxed">
            Cadastre o seu cãozinho, gatinho ou outro animalzinho para gerenciar a caderneta de vacinas, lembretes de reforço e histórico médico com facilidade.
          </p>
          <button
            onClick={() => setIsAddPetModalOpen(true)}
            className="inline-flex items-center gap-2 bg-[#f08136] hover:bg-[#e07126] text-white px-6 py-3.5 rounded-2xl font-bold text-sm transition-all shadow-lg shadow-[#f08136]/25 active:scale-95 cursor-pointer"
          >
            <Plus size={18} strokeWidth={2.5} />
            <span>Cadastrar Meu Primeiro Pet</span>
          </button>
        </div>
      ) : selectedPet ? (
        <>
          {/* Pet Digital Card / Passport Hero */}
          <div className="relative overflow-hidden rounded-[2.5rem] bg-gradient-to-br from-amber-500 via-[#f08136] to-[#e66c19] text-white p-6 sm:p-8 shadow-xl shadow-[#f08136]/15 mb-6">
            <div className="absolute -top-12 -right-12 w-48 h-48 bg-white/10 rounded-full blur-2xl pointer-events-none" />
            <div className="absolute -bottom-8 -left-8 w-40 h-40 bg-black/10 rounded-full blur-xl pointer-events-none" />

            <div className="relative z-10 flex flex-col sm:flex-row sm:items-center justify-between gap-6">
              
              {/* Pet Identity */}
              <div className="flex items-center gap-5">
                <div className="relative">
                  <img
                    src={selectedPet.avatar || 'https://images.unsplash.com/photo-1548767797-d8c844163c4c?auto=format&fit=crop&q=80&w=300'}
                    alt={selectedPet.name}
                    className="w-20 h-20 sm:w-24 sm:h-24 rounded-3xl object-cover border-4 border-white/90 shadow-lg shrink-0"
                    referrerPolicy="no-referrer"
                  />
                  <span className="absolute -bottom-2 -right-2 bg-white text-gray-800 text-xs font-black px-2 py-0.5 rounded-full shadow-md">
                    {selectedPet.species === 'cat' ? '🐱 Gato' : selectedPet.species === 'bird' ? '🦜 Ave' : '🐶 Cão'}
                  </span>
                </div>

                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h2 className="text-2xl sm:text-3xl font-black tracking-tight drop-shadow-xs">
                      {selectedPet.name}
                    </h2>
                    <span className="text-xs bg-white/20 backdrop-blur-xs px-2.5 py-0.5 rounded-full font-bold uppercase tracking-wider">
                      {selectedPet.gender === 'femea' ? '♀ Fêmea' : '♂ Macho'}
                    </span>
                  </div>
                  
                  <p className="text-white/90 text-sm font-semibold mt-0.5">
                    {selectedPet.breed || 'SRD'} {selectedPet.weight ? `• ${selectedPet.weight}` : ''}
                  </p>

                  {selectedPet.microchip && (
                    <p className="text-white/75 text-xs font-mono mt-1">
                      Microchip: {selectedPet.microchip}
                    </p>
                  )}
                </div>
              </div>

              {/* Protection Meter Badge */}
              <div className="bg-white/15 backdrop-blur-md rounded-2xl p-4 border border-white/20 flex items-center gap-4 shrink-0 sm:self-center">
                <div className="w-12 h-12 rounded-xl bg-white text-[#f08136] flex items-center justify-center font-black text-lg shadow-sm">
                  {petStats.healthRate}%
                </div>
                <div>
                  <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-white">
                    <ShieldCheck size={16} />
                    <span>Imunização</span>
                  </div>
                  <p className="text-[11px] text-white/80 font-medium mt-0.5">
                    {petStats.overdue > 0 
                      ? `⚠️ ${petStats.overdue} reforço atrasado` 
                      : petStats.upcoming > 0 
                      ? `🔔 ${petStats.upcoming} vence em breve` 
                      : '✅ Todas em dia!'}
                  </p>
                </div>

                <button
                  onClick={() => setIsRgModalOpen(true)}
                  className="px-3 py-2 bg-white/20 hover:bg-white/30 text-white rounded-xl transition-all cursor-pointer flex items-center gap-1.5 text-xs font-extrabold"
                  title="Ver RG Digital e QR Code de Coleira"
                >
                  <QrCode size={15} />
                  <span className="hidden sm:inline">QR Coleira</span>
                </button>

                <button
                  onClick={() => handleDeletePet(selectedPet.id, selectedPet.name)}
                  className="p-2 text-white/60 hover:text-white hover:bg-white/20 rounded-xl transition-all cursor-pointer ml-auto"
                  title="Excluir este Pet"
                >
                  <Trash2 size={16} />
                </button>
              </div>

            </div>
          </div>

          {/* Quick Add Presets Bar */}
          <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-xs mb-6">
            <div className="flex items-center gap-2 mb-3">
              <Sparkles size={16} className="text-[#f08136]" />
              <span className="text-xs font-extrabold text-gray-800 uppercase tracking-wider">
                Sugestões Rápidas de Vacinas
              </span>
            </div>

            <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
              {selectedPet.species === 'cat' ? (
                <>
                  <PresetChip label="+ Quádrupla Felina (V4)" onClick={() => handleQuickAddPreset('Quádrupla Felina (V4)', 'vacina', 12)} />
                  <PresetChip label="+ Quíntupla Felina (V5)" onClick={() => handleQuickAddPreset('Quíntupla Felina (V5)', 'vacina', 12)} />
                  <PresetChip label="+ Antirrábica Felina" onClick={() => handleQuickAddPreset('Antirrábica Felina', 'vacina', 12)} />
                  <PresetChip label="+ Vermífugo Felino" onClick={() => handleQuickAddPreset('Vermífugo Felino', 'vermifugo', 3)} />
                </>
              ) : (
                <>
                  <PresetChip label="+ Quíntupla / V10" onClick={() => handleQuickAddPreset('Vacina V10 Canina', 'vacina', 12)} />
                  <PresetChip label="+ Antirrábica (Raiva)" onClick={() => handleQuickAddPreset('Vacina Antirrábica', 'vacina', 12)} />
                  <PresetChip label="+ Giárdia" onClick={() => handleQuickAddPreset('Vacina Giardíase', 'vacina', 12)} />
                  <PresetChip label="+ Gripe Canina" onClick={() => handleQuickAddPreset('Gripe Canina (Tosse dos Canis)', 'vacina', 12)} />
                  <PresetChip label="+ Vermífugo (Drontal/Simparic)" onClick={() => handleQuickAddPreset('Vermífugo / Antipulgas', 'vermifugo', 3)} />
                </>
              )}
            </div>
          </div>

          {/* Category Tabs: Vacinas, Vermífugos, Consultas, Medicamentos, Peso */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
            <div className="flex bg-gray-100 p-1 rounded-2xl w-full sm:w-fit overflow-x-auto no-scrollbar">
              <button
                onClick={() => { setActiveTab('vacina'); setStatusFilter('todos'); }}
                className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                  activeTab === 'vacina'
                    ? 'bg-white text-gray-800 shadow-xs'
                    : 'text-gray-500 hover:text-gray-800'
                }`}
              >
                <Syringe size={14} className={activeTab === 'vacina' ? 'text-[#f08136]' : ''} />
                <span>Vacinas</span>
              </button>

              <button
                onClick={() => { setActiveTab('vermifugo'); setStatusFilter('todos'); }}
                className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                  activeTab === 'vermifugo'
                    ? 'bg-white text-gray-800 shadow-xs'
                    : 'text-gray-500 hover:text-gray-800'
                }`}
              >
                <Pill size={14} className={activeTab === 'vermifugo' ? 'text-blue-500' : ''} />
                <span>Vermífugos</span>
              </button>

              <button
                onClick={() => { setActiveTab('consulta'); setStatusFilter('todos'); }}
                className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                  activeTab === 'consulta'
                    ? 'bg-white text-gray-800 shadow-xs'
                    : 'text-gray-500 hover:text-gray-800'
                }`}
              >
                <Stethoscope size={14} className={activeTab === 'consulta' ? 'text-emerald-500' : ''} />
                <span>Consultas</span>
              </button>

              <button
                onClick={() => { setActiveTab('medicamentos'); setStatusFilter('todos'); }}
                className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                  activeTab === 'medicamentos'
                    ? 'bg-white text-gray-800 shadow-xs'
                    : 'text-gray-500 hover:text-gray-800'
                }`}
              >
                <Pill size={14} className={activeTab === 'medicamentos' ? 'text-purple-500' : ''} />
                <span>Medicamentos</span>
                {Array.isArray(selectedPet?.medications) && selectedPet.medications.length > 0 && (
                  <span className="w-2 h-2 rounded-full bg-purple-500" />
                )}
              </button>

              <button
                onClick={() => { setActiveTab('peso'); setStatusFilter('todos'); }}
                className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                  activeTab === 'peso'
                    ? 'bg-white text-gray-800 shadow-xs'
                    : 'text-gray-500 hover:text-gray-800'
                }`}
              >
                <Scale size={14} className={activeTab === 'peso' ? 'text-amber-500' : ''} />
                <span>Peso</span>
              </button>
            </div>

            {/* Action button */}
            <button
              onClick={() => {
                if (activeTab === 'medicamentos') {
                  setIsAddMedModalOpen(true);
                } else if (activeTab === 'peso') {
                  setIsAddWeightModalOpen(true);
                } else {
                  setNewVacType(activeTab === 'vermifugo' ? 'vermifugo' : activeTab === 'consulta' ? 'consulta' : 'vacina');
                  setIsAddVaccineModalOpen(true);
                }
              }}
              className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-gray-900 hover:bg-black text-white text-xs font-bold transition-all shadow-sm active:scale-95 cursor-pointer self-start sm:self-auto shrink-0"
            >
              <Plus size={14} strokeWidth={3} />
              <span>
                {activeTab === 'vacina' ? 'Registrar Vacina' : 
                 activeTab === 'vermifugo' ? 'Registrar Dose' : 
                 activeTab === 'consulta' ? 'Nova Consulta' :
                 activeTab === 'medicamentos' ? 'Novo Medicamento' : 'Registrar Peso'}
              </span>
            </button>
          </div>

          {/* Sub-Filters: Em dia, Próximas, Atrasadas */}
          {activeTab !== 'consulta' && activeTab !== 'medicamentos' && activeTab !== 'peso' && (
            <div className="flex gap-2 mb-4 overflow-x-auto pb-1 scrollbar-hide">
              <button
                onClick={() => setStatusFilter('todos')}
                className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all cursor-pointer ${
                  statusFilter === 'todos' ? 'bg-[#f08136] text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                Todos ({selectedPet.vaccines?.filter(v => activeTab === 'vacina' ? v.type === 'vacina' : v.type !== 'vacina' && v.type !== 'consulta').length || 0})
              </button>
              <button
                onClick={() => setStatusFilter('em_dia')}
                className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all cursor-pointer flex items-center gap-1 ${
                  statusFilter === 'em_dia' ? 'bg-emerald-600 text-white' : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                }`}
              >
                <span>🟢 Em Dia</span>
              </button>
              <button
                onClick={() => setStatusFilter('proximo')}
                className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all cursor-pointer flex items-center gap-1 ${
                  statusFilter === 'proximo' ? 'bg-amber-500 text-white' : 'bg-amber-50 text-amber-700 hover:bg-amber-100'
                }`}
              >
                <span>🟡 Próximas ({petStats.upcoming})</span>
              </button>
              <button
                onClick={() => setStatusFilter('atrasado')}
                className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all cursor-pointer flex items-center gap-1 ${
                  statusFilter === 'atrasado' ? 'bg-red-600 text-white' : 'bg-red-50 text-red-700 hover:bg-red-100'
                }`}
              >
                <span>🔴 Atrasadas ({petStats.overdue})</span>
              </button>
            </div>
          )}

          {/* Tab Content: Medicamentos, Peso, ou Vacinas/Vermífugos/Consultas */}
          {activeTab === 'medicamentos' ? (
            <div className="space-y-4">
              {(!Array.isArray(selectedPet.medications) || selectedPet.medications.length === 0) ? (
                <div className="bg-white rounded-3xl border border-gray-100 border-dashed p-8 text-center">
                  <div className="w-14 h-14 bg-purple-50 text-purple-600 rounded-2xl flex items-center justify-center mx-auto mb-3">
                    <Pill size={24} />
                  </div>
                  <h3 className="font-bold text-gray-800 text-base mb-1">
                    Nenhum medicamento cadastrado
                  </h3>
                  <p className="text-xs text-gray-500 mb-4 max-w-xs mx-auto">
                    Cadastre remédios contínuos ou tratamentos com horários para acompanhar e registrar a dose de cada dia!
                  </p>
                  <button
                    onClick={() => setIsAddMedModalOpen(true)}
                    className="px-4 py-2.5 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-xs font-bold transition-all shadow-md shadow-purple-600/20 cursor-pointer"
                  >
                    + Adicionar Medicamento
                  </button>
                </div>
              ) : (
                selectedPet.medications.map(med => {
                  const todayStr = new Date().toISOString().split('T')[0];
                  const takenToday = med.lastTakenDate === todayStr || (Array.isArray(med.takenDates) && med.takenDates.includes(todayStr));

                  return (
                    <motion.div
                      key={med.id}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="bg-white rounded-2xl p-5 border border-gray-100 shadow-2xs hover:shadow-xs transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                    >
                      <div className="flex items-start gap-3.5 min-w-0">
                        <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 ${
                          takenToday ? 'bg-emerald-50 text-emerald-600' : 'bg-purple-50 text-purple-600'
                        }`}>
                          <Pill size={22} />
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h4 className="font-extrabold text-gray-800 text-base leading-tight">
                              {med.name}
                            </h4>
                            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-purple-100 text-purple-800">
                              {med.dosage}
                            </span>
                            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-gray-100 text-gray-600">
                              {med.frequency}
                            </span>
                          </div>

                          <div className="flex items-center gap-4 text-xs text-gray-500 font-medium mt-1.5 flex-wrap">
                            <span className="flex items-center gap-1">
                              <Calendar size={13} className="text-gray-400" />
                              Início: <strong>{formatDateSafely(med.startDate)}</strong>
                            </span>
                            {med.endDate && (
                              <span className="flex items-center gap-1 text-gray-700">
                                <Clock size={13} className="text-purple-600" />
                                Término: <strong>{formatDateSafely(med.endDate)}</strong>
                              </span>
                            )}
                            {(med.lastTakenDate || (Array.isArray(med.takenDates) && med.takenDates.length > 0)) && (
                              <span className="text-emerald-600 font-bold flex items-center gap-1">
                                <CheckCircle2 size={13} />
                                Última dose: {formatDateSafely(med.lastTakenDate || (med.takenDates && med.takenDates[med.takenDates.length - 1]))}
                              </span>
                            )}
                          </div>

                          {med.notes && (
                            <p className="text-xs text-gray-500 bg-gray-50 p-2 rounded-xl mt-2 leading-relaxed">
                              {med.notes}
                            </p>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
                        <button
                          type="button"
                          onClick={() => {
                            downloadCalendarIcs({
                              title: `💊 ${med.name} (${med.dosage}) — ${selectedPet.name}`,
                              description: `Medicação: ${med.name}\nDosagem: ${med.dosage}\nFrequência: ${med.frequency}\nObservações: ${med.notes || ''}`,
                              dateStr: med.endDate || med.startDate
                            });
                            toast.success('Evento exportado para o seu Calendário! 📅');
                          }}
                          className="p-2.5 text-purple-600 bg-purple-50 hover:bg-purple-100 rounded-xl transition-all cursor-pointer"
                          title="Adicionar ao Google/Apple Calendar (.ics)"
                        >
                          <CalendarPlus size={16} />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleToggleMedTaken(med.id)}
                          className={`px-4 py-2.5 rounded-xl font-extrabold text-xs flex items-center gap-1.5 transition-all shadow-xs cursor-pointer ${
                            takenToday
                              ? 'bg-emerald-600 text-white hover:bg-emerald-700 shadow-emerald-600/20'
                              : 'bg-purple-600 text-white hover:bg-purple-700 shadow-purple-600/20'
                          }`}
                        >
                          <CheckCircle2 size={15} />
                          <span>{takenToday ? 'Tomou Hoje! 🎉' : 'Tomou Hoje? ✅'}</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteMedication(med.id)}
                          className="p-2.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all cursor-pointer"
                          title="Remover medicamento"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </motion.div>
                  );
                })
              )}
            </div>
          ) : activeTab === 'peso' ? (
            <div className="space-y-4">
              {/* Current Weight Card */}
              <div className="bg-gradient-to-r from-amber-500 to-orange-500 rounded-3xl p-5 text-white flex items-center justify-between shadow-md shadow-amber-500/20">
                <div className="flex items-center gap-4">
                  <div className="w-14 h-14 bg-white/20 backdrop-blur-md rounded-2xl flex items-center justify-center text-white">
                    <Scale size={28} />
                  </div>
                  <div>
                    <span className="text-xs uppercase font-bold tracking-wider text-amber-100">Peso Atual</span>
                    <h3 className="text-2xl font-black">
                      {selectedPet.weightHistory && selectedPet.weightHistory.length > 0
                        ? `${selectedPet.weightHistory[0].weightKg} kg`
                        : selectedPet.weight || 'Não informado'}
                    </h3>
                  </div>
                </div>
                <button
                  onClick={() => setIsAddWeightModalOpen(true)}
                  className="px-4 py-2.5 bg-white text-gray-800 rounded-2xl font-extrabold text-xs shadow-sm hover:bg-gray-50 transition-all cursor-pointer"
                >
                  + Nova Pesagem
                </button>
              </div>

              {/* Visual SVG Weight Evolution Curve & Clinical Variation Alert */}
              {Array.isArray(selectedPet.weightHistory) && selectedPet.weightHistory.length >= 2 && (() => {
                const chronological = [...selectedPet.weightHistory].reverse();
                const weights = chronological.map(w => w.weightKg);
                const minW = Math.min(...weights);
                const maxW = Math.max(...weights);
                const range = Math.max(0.5, maxW - minW);
                const latest = weights[weights.length - 1];
                const prev = weights[weights.length - 2];
                const diffKg = +(latest - prev).toFixed(2);
                const diffPct = prev > 0 ? +((diffKg / prev) * 100).toFixed(1) : 0;
                const isRapidChange = Math.abs(diffPct) >= 10;

                const pts = chronological.map((item, idx) => {
                  const x = 40 + (idx / Math.max(1, chronological.length - 1)) * 520;
                  const y = 135 - ((item.weightKg - minW) / range) * 95;
                  return { x, y, item };
                });
                const polylinePoints = pts.map(p => `${p.x},${p.y}`).join(' ');

                return (
                  <div className="bg-white rounded-3xl border border-gray-100 p-5 shadow-2xs space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <TrendingUp size={16} className="text-amber-500" />
                        <span className="font-extrabold text-xs text-gray-800 uppercase tracking-wider">
                          Curva Clínica de Evolução Ponderal
                        </span>
                      </div>
                      <span className={`px-2.5 py-1 rounded-full text-xs font-black ${
                        isRapidChange
                          ? 'bg-red-100 text-red-700'
                          : diffKg === 0
                          ? 'bg-gray-100 text-gray-700'
                          : 'bg-emerald-100 text-emerald-800'
                      }`}>
                        {diffKg > 0 ? `+${diffKg} kg (+${diffPct}%)` : `${diffKg} kg (${diffPct}%)`} desde a última pesagem
                      </span>
                    </div>

                    {isRapidChange && (
                      <div className="p-3 rounded-2xl bg-red-50 border border-red-200 text-xs text-red-800 font-medium">
                        ⚠️ <strong>Alerta Clínico:</strong> Variação de <strong>{Math.abs(diffPct)}%</strong> detectada entre as últimas pesagens. Variações acima de 10% merecem avaliação nutricional com o veterinário.
                      </div>
                    )}

                    <div className="w-full overflow-x-auto">
                      <svg viewBox="0 0 600 175" className="w-full h-40 overflow-visible">
                        <defs>
                          <linearGradient id="weightArea" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#f59e0b" stopOpacity="0.32" />
                            <stop offset="100%" stopColor="#f59e0b" stopOpacity="0.0" />
                          </linearGradient>
                        </defs>
                        <line x1="40" y1="40" x2="560" y2="40" stroke="#f1f5f9" strokeWidth="1" />
                        <line x1="40" y1="88" x2="560" y2="88" stroke="#f1f5f9" strokeWidth="1" />
                        <line x1="40" y1="135" x2="560" y2="135" stroke="#e2e8f0" strokeWidth="1" />
                        <polygon
                          points={`40,135 ${polylinePoints} 560,135`}
                          fill="url(#weightArea)"
                        />
                        <polyline
                          fill="none"
                          stroke="#f08136"
                          strokeWidth="3.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          points={polylinePoints}
                        />
                        {pts.map((p) => (
                          <g key={p.item.id}>
                            <circle cx={p.x} cy={p.y} r="5.5" fill="#ffffff" stroke="#f08136" strokeWidth="3" />
                            <text x={p.x} y={p.y - 12} textAnchor="middle" className="fill-slate-800 font-black text-[11px]">
                              {p.item.weightKg}kg
                            </text>
                            <text x={p.x} y={156} textAnchor="middle" className="fill-slate-400 font-semibold text-[10px]">
                              {formatDateSafely(p.item.date).slice(0, 5)}
                            </text>
                          </g>
                        ))}
                      </svg>
                    </div>
                  </div>
                );
              })()}

              {/* Weight Log Table */}
              {(!Array.isArray(selectedPet.weightHistory) || selectedPet.weightHistory.length === 0) ? (
                <div className="bg-white rounded-3xl border border-gray-100 border-dashed p-8 text-center">
                  <div className="w-14 h-14 bg-amber-50 text-amber-600 rounded-2xl flex items-center justify-center mx-auto mb-3">
                    <Scale size={24} />
                  </div>
                  <h3 className="font-bold text-gray-800 text-base mb-1">
                    Nenhum histórico de peso
                  </h3>
                  <p className="text-xs text-gray-500 mb-4 max-w-xs mx-auto">
                    Acompanhe o ganho ou perda de peso do pet registrando pesagens regulares no veterinário ou em casa!
                  </p>
                  <button
                    onClick={() => setIsAddWeightModalOpen(true)}
                    className="px-4 py-2.5 bg-[#f08136] hover:bg-[#e66c19] text-white rounded-xl text-xs font-bold transition-all shadow-md shadow-[#f08136]/20 cursor-pointer"
                  >
                    + Registrar Primeira Pesagem
                  </button>
                </div>
              ) : (
                <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-2xs">
                  <div className="p-4 border-b border-gray-100 flex items-center justify-between">
                    <span className="font-bold text-xs text-gray-700 uppercase tracking-wide">
                      Histórico de Pesagens ({selectedPet.weightHistory.length})
                    </span>
                  </div>
                  <div className="divide-y divide-gray-100">
                    {selectedPet.weightHistory.map((item, idx) => (
                      <div key={item.id} className="p-4 flex items-center justify-between hover:bg-gray-50/50 transition-colors">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center font-bold text-xs">
                            #{selectedPet.weightHistory!.length - idx}
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-black text-gray-800 text-base">{item.weightKg} kg</span>
                              {idx === 0 && (
                                <span className="text-[10px] bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full font-bold">
                                  Mais recente
                                </span>
                              )}
                            </div>
                            <span className="text-xs text-gray-400 font-medium">
                              {formatDateSafely(item.date)}
                              {item.notes ? ` • ${item.notes}` : ''}
                            </span>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleDeleteWeight(item.id)}
                          className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all cursor-pointer"
                          title="Remover peso"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            /* Records List */
            <div className="space-y-3">
              {currentRecords.length === 0 ? (
                <div className="bg-white rounded-3xl border border-gray-100 border-dashed p-8 text-center">
                  <div className="w-14 h-14 bg-gray-50 rounded-2xl flex items-center justify-center mx-auto mb-3 text-gray-400">
                    <Syringe size={24} />
                  </div>
                  <h3 className="font-bold text-gray-700 text-base mb-1">
                    Nenhum registro encontrado
                  </h3>
                  <p className="text-xs text-gray-500 mb-4 max-w-xs mx-auto">
                    Você ainda não cadastrou registros nesta categoria para o pet <strong>{selectedPet.name}</strong>.
                  </p>
                  <button
                    onClick={() => {
                      setNewVacType(activeTab === 'vermifugo' ? 'vermifugo' : activeTab === 'consulta' ? 'consulta' : 'vacina');
                      setIsAddVaccineModalOpen(true);
                    }}
                    className="px-4 py-2 bg-[#f08136] text-white rounded-xl text-xs font-bold hover:bg-[#e07126] transition-all cursor-pointer"
                  >
                    Adicionar Agora
                  </button>
                </div>
              ) : (
                currentRecords.map(record => {
                  const badge = getVaccineStatus(record.dateApplied, record.nextDueDate);
                  return (
                    <motion.div
                      key={record.id}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="bg-white rounded-2xl p-4 sm:p-5 border border-gray-100 shadow-2xs hover:shadow-xs transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                    >
                      <div className="flex items-start gap-3.5 min-w-0">
                        <div className={`w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 ${
                          record.type === 'vermifugo' ? 'bg-blue-50 text-blue-600' :
                          record.type === 'consulta' ? 'bg-emerald-50 text-emerald-600' :
                          'bg-orange-50 text-[#f08136]'
                        }`}>
                          {record.type === 'vermifugo' ? <Pill size={20} /> :
                           record.type === 'consulta' ? <Stethoscope size={20} /> :
                           <Syringe size={20} />}
                        </div>

                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h4 className="font-extrabold text-gray-800 text-sm sm:text-base leading-tight">
                              {record.name}
                            </h4>
                            <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider ${
                              badge.color === 'emerald' ? 'bg-emerald-100 text-emerald-800' :
                              badge.color === 'amber' ? 'bg-amber-100 text-amber-800' :
                              'bg-red-100 text-red-800'
                            }`}>
                              {badge.label}
                            </span>
                          </div>

                          <div className="flex items-center gap-4 text-xs text-gray-500 font-medium mt-1.5 flex-wrap">
                            <span className="flex items-center gap-1">
                              <Calendar size={13} className="text-gray-400" />
                              Aplicada em: <strong>{formatDateSafely(record.dateApplied)}</strong>
                            </span>

                            {record.nextDueDate && (
                              <span className="flex items-center gap-1 text-gray-700">
                                <Clock size={13} className="text-[#f08136]" />
                                Próximo reforço: <strong>{formatDateSafely(record.nextDueDate)}</strong>
                              </span>
                            )}

                            {record.veterinarian && (
                              <span className="text-gray-400">
                                Dr(a): <strong>{record.veterinarian}</strong>
                              </span>
                            )}

                            {record.clinic && (
                              <span className="text-gray-400">
                                Clínica: {record.clinic}
                              </span>
                            )}

                            {record.batch && (
                              <span className="text-[10px] text-gray-400 font-mono bg-gray-50 px-1.5 py-0.5 rounded">
                                Lote: {record.batch}
                              </span>
                            )}
                          </div>

                          {record.notes && (
                            <p className="text-xs text-gray-500 bg-gray-50 p-2 rounded-xl mt-2 leading-relaxed">
                              {record.notes}
                            </p>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
                        <button
                          onClick={() => {
                            exportVaccineToCalendar(selectedPet, record);
                            toast.success('Lembrete (.ics) baixado para o seu Calendário! 📅');
                          }}
                          className="px-3 py-2 text-[#f08136] bg-orange-50 hover:bg-orange-100 rounded-xl transition-all cursor-pointer flex items-center gap-1.5 text-xs font-bold"
                          title="Salvar lembrete no Google/Apple Calendar (.ics)"
                        >
                          <CalendarPlus size={15} />
                          <span className="hidden sm:inline">Agendar</span>
                        </button>
                        <button
                          onClick={() => handleDeleteVaccine(record.id)}
                          className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all cursor-pointer"
                          title="Remover vacina"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </motion.div>
                  );
                })
              )}
            </div>
          )}
        </>
      ) : null}

      {/* Modal: Adicionar Novo Pet */}
      <AnimatePresence>
        {isAddPetModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white w-full max-w-lg rounded-3xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden"
            >
              <div className="p-5 border-b border-gray-100 flex items-center justify-between shrink-0 bg-white">
                <div className="flex items-center gap-2">
                  <span className="text-xl">🐾</span>
                  <h2 className="font-extrabold text-lg text-gray-800">Cadastrar Pet na Caderneta</h2>
                </div>
                <button
                  onClick={() => setIsAddPetModalOpen(false)}
                  className="p-2 bg-gray-50 hover:bg-gray-100 rounded-full text-gray-400 hover:text-gray-700 transition-colors cursor-pointer"
                >
                  <X size={18} />
                </button>
              </div>

              <form onSubmit={handleCreatePet} className="flex-1 overflow-y-auto p-6 space-y-4">
                
                {/* Pet Photo */}
                <div className="flex items-center gap-4">
                  <div className="w-16 h-16 rounded-2xl bg-gray-100 overflow-hidden border-2 border-dashed border-gray-300 flex items-center justify-center relative shrink-0">
                    {newPetAvatar ? (
                      <img src={newPetAvatar} alt="Pet" className="w-full h-full object-cover" />
                    ) : (
                      <Camera size={22} className="text-gray-400" />
                    )}
                  </div>
                  <div className="flex-1">
                    <label className="block text-xs font-bold text-gray-700 mb-1 uppercase tracking-wide">
                      Foto do Pet (Opcional)
                    </label>
                    <label className="inline-block px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-semibold rounded-xl cursor-pointer transition-colors">
                      Escolher foto
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => handleImageUpload(e, setNewPetAvatar)}
                      />
                    </label>
                  </div>
                </div>

                {/* Name */}
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1 uppercase tracking-wide">
                    Nome do Pet *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Ex: Thor, Luna, Bob..."
                    value={newPetName}
                    onChange={(e) => setNewPetName(e.target.value)}
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl py-2.5 px-3.5 text-sm focus:outline-none focus:border-[#f08136] focus:bg-white transition-all"
                  />
                </div>

                {/* Species & Gender */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1 uppercase tracking-wide">
                      Espécie
                    </label>
                    <select
                      value={newPetSpecies}
                      onChange={(e) => setNewPetSpecies(e.target.value as PetSpecies)}
                      className="w-full bg-gray-50 border border-gray-200 rounded-xl py-2.5 px-3 text-sm focus:outline-none focus:border-[#f08136] focus:bg-white transition-all"
                    >
                      <option value="dog">🐶 Cachorro</option>
                      <option value="cat">🐱 Gato</option>
                      <option value="bird">🦜 Ave</option>
                      <option value="other">🐰 Outro</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1 uppercase tracking-wide">
                      Sexo
                    </label>
                    <select
                      value={newPetGender}
                      onChange={(e) => setNewPetGender(e.target.value as 'macho' | 'femea')}
                      className="w-full bg-gray-50 border border-gray-200 rounded-xl py-2.5 px-3 text-sm focus:outline-none focus:border-[#f08136] focus:bg-white transition-all"
                    >
                      <option value="macho">♂ Macho</option>
                      <option value="femea">♀ Fêmea</option>
                    </select>
                  </div>
                </div>

                {/* Breed & Weight */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1 uppercase tracking-wide">
                      Raça
                    </label>
                    <input
                      type="text"
                      placeholder="Ex: Golden, Poodle, SRD..."
                      value={newPetBreed}
                      onChange={(e) => setNewPetBreed(e.target.value)}
                      className="w-full bg-gray-50 border border-gray-200 rounded-xl py-2.5 px-3.5 text-sm focus:outline-none focus:border-[#f08136] focus:bg-white transition-all"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1 uppercase tracking-wide">
                      Peso Estimado
                    </label>
                    <input
                      type="text"
                      placeholder="Ex: 8.5 kg"
                      value={newPetWeight}
                      onChange={(e) => setNewPetWeight(e.target.value)}
                      className="w-full bg-gray-50 border border-gray-200 rounded-xl py-2.5 px-3.5 text-sm focus:outline-none focus:border-[#f08136] focus:bg-white transition-all"
                    />
                  </div>
                </div>

                {/* BirthDate & Microchip */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1 uppercase tracking-wide">
                      Data de Nascimento
                    </label>
                    <input
                      type="date"
                      value={newPetBirthDate}
                      onChange={(e) => setNewPetBirthDate(e.target.value)}
                      className="w-full bg-gray-50 border border-gray-200 rounded-xl py-2.5 px-3 text-sm focus:outline-none focus:border-[#f08136] focus:bg-white transition-all"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1 uppercase tracking-wide">
                      Nº do Microchip
                    </label>
                    <input
                      type="text"
                      placeholder="Opcional"
                      value={newPetMicrochip}
                      onChange={(e) => setNewPetMicrochip(e.target.value)}
                      className="w-full bg-gray-50 border border-gray-200 rounded-xl py-2.5 px-3.5 text-sm focus:outline-none focus:border-[#f08136] focus:bg-white transition-all"
                    />
                  </div>
                </div>

                <div className="pt-2">
                  <button
                    type="submit"
                    className="w-full bg-[#f08136] hover:bg-[#e07126] text-white py-3 rounded-xl font-bold text-sm transition-all shadow-md cursor-pointer"
                  >
                    Salvar e Abrir Caderneta
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Modal: Adicionar Vacina / Registro */}
      <AnimatePresence>
        {isAddVaccineModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white w-full max-w-lg rounded-3xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden"
            >
              <div className="p-5 border-b border-gray-100 flex items-center justify-between shrink-0 bg-white">
                <div className="flex items-center gap-2">
                  <span className="p-1.5 bg-orange-50 text-[#f08136] rounded-lg"><Syringe size={18} /></span>
                  <h2 className="font-extrabold text-lg text-gray-800">
                    Novo Registro de Saúde ({selectedPet?.name})
                  </h2>
                </div>
                <button
                  onClick={() => setIsAddVaccineModalOpen(false)}
                  className="p-2 bg-gray-50 hover:bg-gray-100 rounded-full text-gray-400 hover:text-gray-700 transition-colors cursor-pointer"
                >
                  <X size={18} />
                </button>
              </div>

              <form onSubmit={handleAddVaccine} className="flex-1 overflow-y-auto p-6 space-y-4">
                
                {/* AI Gemini Vision OCR Scanner Banner */}
                <div className="p-3.5 rounded-2xl bg-gradient-to-r from-amber-50 via-orange-50 to-amber-50 border border-orange-200/80 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <span className="text-xs font-black text-slate-900 flex items-center gap-1.5">
                      <Sparkles size={14} className="text-[#f08136]" />
                      Leitura Inteligente por Foto (IA)
                    </span>
                    <p className="text-[11px] text-slate-600 mt-0.5 leading-snug">
                      Fotografe o selo/etiqueta da carteirinha de papel para preencher nome, lote e datas automaticamente.
                    </p>
                  </div>
                  <label className={`shrink-0 px-3.5 py-2.5 rounded-xl bg-[#f08136] hover:bg-[#d96e27] text-white text-xs font-extrabold flex items-center gap-1.5 shadow-sm transition-all cursor-pointer ${scanningVaccine ? 'opacity-60 pointer-events-none' : ''}`}>
                    <ScanLine size={15} className={scanningVaccine ? 'animate-spin' : ''} />
                    <span>{scanningVaccine ? 'Lendo...' : 'Ler Selo'}</span>
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={handleScanVaccineWithAi}
                      disabled={scanningVaccine}
                    />
                  </label>
                </div>

                {/* Type Selection */}
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1.5 uppercase tracking-wide">
                    Categoria
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    <button
                      type="button"
                      onClick={() => setNewVacType('vacina')}
                      className={`py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                        newVacType === 'vacina' ? 'bg-[#f08136] text-white shadow-xs' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}
                    >
                      💉 Vacina
                    </button>
                    <button
                      type="button"
                      onClick={() => setNewVacType('vermifugo')}
                      className={`py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                        newVacType === 'vermifugo' ? 'bg-blue-600 text-white shadow-xs' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}
                    >
                      💊 Vermífugo
                    </button>
                    <button
                      type="button"
                      onClick={() => setNewVacType('consulta')}
                      className={`py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                        newVacType === 'consulta' ? 'bg-emerald-600 text-white shadow-xs' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}
                    >
                      📋 Consulta
                    </button>
                  </div>
                </div>

                {/* Name */}
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1 uppercase tracking-wide">
                    Nome da Vacina / Medicamento *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Ex: Vacina V10, Antirrábica, Simparic..."
                    value={newVacName}
                    onChange={(e) => setNewVacName(e.target.value)}
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl py-2.5 px-3.5 text-sm focus:outline-none focus:border-[#f08136] focus:bg-white transition-all"
                  />
                </div>

                {/* Application Date & Next Due */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1 uppercase tracking-wide">
                      Data da Aplicação *
                    </label>
                    <input
                      type="date"
                      required
                      value={newVacDateApplied}
                      onChange={(e) => setNewVacDateApplied(e.target.value)}
                      className="w-full bg-gray-50 border border-gray-200 rounded-xl py-2.5 px-3 text-sm focus:outline-none focus:border-[#f08136] focus:bg-white transition-all"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1 uppercase tracking-wide">
                      Próximo Reforço
                    </label>
                    <input
                      type="date"
                      value={newVacNextDue}
                      onChange={(e) => setNewVacNextDue(e.target.value)}
                      className="w-full bg-gray-50 border border-gray-200 rounded-xl py-2.5 px-3 text-sm focus:outline-none focus:border-[#f08136] focus:bg-white transition-all"
                    />
                  </div>
                </div>

                {/* Quick Date Shortcuts */}
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-[10px] text-gray-400 font-bold uppercase">Atalho Reforço:</span>
                  <button
                    type="button"
                    onClick={() => setNextDueDatePreset({ days: 30 })}
                    className="px-2 py-0.5 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-md text-[11px] font-semibold cursor-pointer"
                  >
                    +30 dias
                  </button>
                  <button
                    type="button"
                    onClick={() => setNextDueDatePreset({ months: 3 })}
                    className="px-2 py-0.5 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-md text-[11px] font-semibold cursor-pointer"
                  >
                    +3 meses
                  </button>
                  <button
                    type="button"
                    onClick={() => setNextDueDatePreset({ months: 6 })}
                    className="px-2 py-0.5 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-md text-[11px] font-semibold cursor-pointer"
                  >
                    +6 meses
                  </button>
                  <button
                    type="button"
                    onClick={() => setNextDueDatePreset({ months: 12 })}
                    className="px-2 py-0.5 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-md text-[11px] font-semibold cursor-pointer"
                  >
                    +1 ano
                  </button>
                </div>

                {/* Vet & Clinic */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1 uppercase tracking-wide">
                      Veterinário(a)
                    </label>
                    <input
                      type="text"
                      placeholder="Dr(a). Fulano"
                      value={newVacVet}
                      onChange={(e) => setNewVacVet(e.target.value)}
                      className="w-full bg-gray-50 border border-gray-200 rounded-xl py-2.5 px-3.5 text-sm focus:outline-none focus:border-[#f08136] focus:bg-white transition-all"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1 uppercase tracking-wide">
                      Clínica Veterinária
                    </label>
                    <input
                      type="text"
                      placeholder="Ex: PetCare"
                      value={newVacClinic}
                      onChange={(e) => setNewVacClinic(e.target.value)}
                      className="w-full bg-gray-50 border border-gray-200 rounded-xl py-2.5 px-3.5 text-sm focus:outline-none focus:border-[#f08136] focus:bg-white transition-all"
                    />
                  </div>
                </div>

                {/* Batch & Notes */}
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1 uppercase tracking-wide">
                    Número do Lote (Opcional)
                  </label>
                  <input
                    type="text"
                    placeholder="Ex: LOTE-9831"
                    value={newVacBatch}
                    onChange={(e) => setNewVacBatch(e.target.value)}
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl py-2.5 px-3.5 text-sm focus:outline-none focus:border-[#f08136] focus:bg-white transition-all"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1 uppercase tracking-wide">
                    Observações / Reações
                  </label>
                  <textarea
                    rows={2}
                    placeholder="Ex: Não apresentou febre, dose de reforço anual..."
                    value={newVacNotes}
                    onChange={(e) => setNewVacNotes(e.target.value)}
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl py-2.5 px-3.5 text-sm focus:outline-none focus:border-[#f08136] focus:bg-white transition-all resize-none"
                  />
                </div>

                <div className="pt-2">
                  <button
                    type="submit"
                    className="w-full bg-[#f08136] hover:bg-[#e07126] text-white py-3 rounded-xl font-bold text-sm transition-all shadow-md cursor-pointer"
                  >
                    Salvar Registro de Saúde
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Modal: Visualizar e Imprimir Carteirinha Pet */}
      <AnimatePresence>
        {isPrintModalOpen && selectedPet && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white w-full max-w-2xl rounded-3xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden"
            >
              <div className="p-4 border-b border-gray-100 flex items-center justify-between bg-white shrink-0">
                <div className="flex items-center gap-2">
                  <Printer size={18} className="text-[#f08136]" />
                  <h3 className="font-extrabold text-base text-gray-800">
                    Carteira de Vacinação Oficial — {selectedPet.name}
                  </h3>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => window.print()}
                    className="px-3.5 py-1.5 bg-[#f08136] text-white rounded-xl text-xs font-bold hover:bg-[#e07126] transition-all cursor-pointer flex items-center gap-1.5"
                  >
                    <Printer size={14} /> Imprimir / PDF
                  </button>
                  <button
                    onClick={() => setIsPrintModalOpen(false)}
                    className="p-1.5 bg-gray-100 hover:bg-gray-200 rounded-full text-gray-500 cursor-pointer"
                  >
                    <X size={16} />
                  </button>
                </div>
              </div>

              {/* Printable Body */}
              <div className="flex-1 overflow-y-auto p-6 bg-gray-50/50 space-y-6 print:p-0 print:bg-white">
                
                {/* Header Passport Card */}
                <div className="bg-white border-2 border-[#f08136] rounded-3xl p-6 shadow-sm flex items-center gap-6">
                  <img
                    src={selectedPet.avatar}
                    alt={selectedPet.name}
                    className="w-24 h-24 rounded-2xl object-cover border-2 border-gray-100 shrink-0"
                  />
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <h2 className="text-2xl font-black text-gray-900">{selectedPet.name}</h2>
                      <span className="bg-orange-50 text-[#f08136] font-extrabold text-xs px-3 py-1 rounded-full border border-orange-200">
                        🐾 UNIÃO PET
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 mt-2 text-xs text-gray-600">
                      <p><strong>Tutor:</strong> {currentUser.name}</p>
                      <p><strong>Espécie:</strong> {selectedPet.species === 'cat' ? 'Felino' : 'Canino'}</p>
                      <p><strong>Raça:</strong> {selectedPet.breed || 'SRD'}</p>
                      <p><strong>Sexo:</strong> {selectedPet.gender === 'femea' ? 'Fêmea' : 'Macho'}</p>
                      {selectedPet.weight && <p><strong>Peso:</strong> {selectedPet.weight}</p>}
                      {selectedPet.microchip && <p><strong>Microchip:</strong> {selectedPet.microchip}</p>}
                    </div>
                  </div>
                  <div className="bg-gray-50 p-2 rounded-2xl border border-gray-200 flex flex-col items-center shrink-0">
                    <img
                      src={getQrCodeImageUrl(getPetRescueLink(selectedPet.id), 160)}
                      alt="QR Code RG Pet"
                      className="w-20 h-20 rounded-lg"
                    />
                    <span className="text-[8px] font-black uppercase text-gray-500 mt-1">
                      QR Resgate
                    </span>
                  </div>
                </div>

                {/* Vaccines Table */}
                <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
                  <div className="p-3 bg-gray-100 border-b border-gray-200 font-extrabold text-xs text-gray-700 uppercase tracking-wide">
                    Histórico de Vacinas e Imunizações
                  </div>
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-gray-100 bg-gray-50 text-gray-500 font-bold">
                        <th className="p-3">Vacina / Produto</th>
                        <th className="p-3">Data Aplicação</th>
                        <th className="p-3">Próximo Reforço</th>
                        <th className="p-3">Veterinário / Clínica</th>
                        <th className="p-3">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {selectedPet.vaccines && selectedPet.vaccines.length > 0 ? (
                        selectedPet.vaccines.map(v => {
                          const status = getVaccineStatus(v.dateApplied, v.nextDueDate);
                          return (
                            <tr key={v.id} className="hover:bg-gray-50/50">
                              <td className="p-3 font-bold text-gray-800">{v.name}</td>
                              <td className="p-3 text-gray-600">{formatDateSafely(v.dateApplied)}</td>
                              <td className="p-3 text-gray-600">{v.nextDueDate ? formatDateSafely(v.nextDueDate) : '-'}</td>
                              <td className="p-3 text-gray-600">{v.veterinarian || v.clinic || '-'}</td>
                              <td className="p-3">
                                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                  status.color === 'emerald' ? 'bg-emerald-100 text-emerald-800' :
                                  status.color === 'amber' ? 'bg-amber-100 text-amber-800' : 'bg-red-100 text-red-800'
                                }`}>
                                  {status.label}
                                </span>
                              </td>
                            </tr>
                          );
                        })
                      ) : (
                        <tr>
                          <td colSpan={5} className="p-4 text-center text-gray-400">
                            Nenhum registro lançado nesta carteira.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>

                <div className="text-center text-[10px] text-gray-400">
                  Emitido digitalmente pelo app UniãoPet em {new Date().toLocaleDateString('pt-BR')}. Mantenha a vacinação do seu pet em dia!
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Modal: Adicionar Medicamento */}
      <AnimatePresence>
        {isAddMedModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white w-full max-w-lg rounded-3xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden"
            >
              <div className="p-5 border-b border-gray-100 flex items-center justify-between shrink-0 bg-white">
                <div className="flex items-center gap-2">
                  <span className="text-xl">💊</span>
                  <h2 className="font-extrabold text-lg text-gray-800">Cadastrar Medicamento</h2>
                </div>
                <button
                  onClick={() => setIsAddMedModalOpen(false)}
                  className="p-2 bg-gray-50 hover:bg-gray-100 rounded-full text-gray-400 hover:text-gray-700 transition-colors cursor-pointer"
                >
                  <X size={18} />
                </button>
              </div>

              <form onSubmit={handleCreateMedication} className="flex-1 overflow-y-auto p-6 space-y-4">
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1 uppercase tracking-wide">
                    Nome do Medicamento *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Ex: Apoquel, Prednisona, Simparic..."
                    value={newMedName}
                    onChange={(e) => setNewMedName(e.target.value)}
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl py-2.5 px-3.5 text-sm focus:outline-none focus:border-purple-500 focus:bg-white transition-all"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1 uppercase tracking-wide">
                      Dosagem *
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="Ex: 1 comp (16mg)"
                      value={newMedDosage}
                      onChange={(e) => setNewMedDosage(e.target.value)}
                      className="w-full bg-gray-50 border border-gray-200 rounded-xl py-2.5 px-3.5 text-sm focus:outline-none focus:border-purple-500 focus:bg-white transition-all"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1 uppercase tracking-wide">
                      Frequência
                    </label>
                    <select
                      value={newMedFrequency}
                      onChange={(e) => setNewMedFrequency(e.target.value)}
                      className="w-full bg-gray-50 border border-gray-200 rounded-xl py-2.5 px-3.5 text-sm focus:outline-none focus:border-purple-500 focus:bg-white transition-all"
                    >
                      <option value="1x ao dia">1x ao dia</option>
                      <option value="12 em 12 horas">12 em 12 horas (2x)</option>
                      <option value="8 em 8 horas">8 em 8 horas (3x)</option>
                      <option value="A cada 48h">A cada 48 horas</option>
                      <option value="Semanal">Semanal</option>
                      <option value="Mensal">Mensal</option>
                      <option value="Uso contínuo">Uso contínuo</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1 uppercase tracking-wide">
                      Data de Início *
                    </label>
                    <input
                      type="date"
                      required
                      value={newMedStartDate}
                      onChange={(e) => setNewMedStartDate(e.target.value)}
                      className="w-full bg-gray-50 border border-gray-200 rounded-xl py-2.5 px-3.5 text-sm focus:outline-none focus:border-purple-500 focus:bg-white transition-all"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1 uppercase tracking-wide">
                      Data de Término (Opcional)
                    </label>
                    <input
                      type="date"
                      value={newMedEndDate}
                      onChange={(e) => setNewMedEndDate(e.target.value)}
                      className="w-full bg-gray-50 border border-gray-200 rounded-xl py-2.5 px-3.5 text-sm focus:outline-none focus:border-purple-500 focus:bg-white transition-all"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1 uppercase tracking-wide">
                    Observações / Instruções
                  </label>
                  <textarea
                    rows={3}
                    placeholder="Ex: Administrar com a refeição matinal. Evitar jejum."
                    value={newMedNotes}
                    onChange={(e) => setNewMedNotes(e.target.value)}
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl py-2.5 px-3.5 text-sm focus:outline-none focus:border-purple-500 focus:bg-white transition-all resize-none"
                  />
                </div>

                <div className="pt-2">
                  <button
                    type="submit"
                    className="w-full py-3 bg-purple-600 hover:bg-purple-700 text-white rounded-xl font-bold text-sm shadow-md shadow-purple-600/20 transition-all cursor-pointer"
                  >
                    Salvar Medicamento
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Modal: Registrar Peso */}
      <AnimatePresence>
        {isAddWeightModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white w-full max-w-md rounded-3xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden"
            >
              <div className="p-5 border-b border-gray-100 flex items-center justify-between shrink-0 bg-white">
                <div className="flex items-center gap-2">
                  <span className="text-xl">⚖️</span>
                  <h2 className="font-extrabold text-lg text-gray-800">Registrar Pesagem</h2>
                </div>
                <button
                  onClick={() => setIsAddWeightModalOpen(false)}
                  className="p-2 bg-gray-50 hover:bg-gray-100 rounded-full text-gray-400 hover:text-gray-700 transition-colors cursor-pointer"
                >
                  <X size={18} />
                </button>
              </div>

              <form onSubmit={handleCreateWeight} className="p-6 space-y-4">
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1 uppercase tracking-wide">
                    Peso em Quilogramas (kg) *
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      step="0.05"
                      min="0.1"
                      required
                      placeholder="Ex: 14.5"
                      value={newWeightKg}
                      onChange={(e) => setNewWeightKg(e.target.value)}
                      className="w-full bg-gray-50 border border-gray-200 rounded-xl py-3 px-4 text-base font-black text-gray-800 focus:outline-none focus:border-amber-500 focus:bg-white transition-all"
                    />
                    <span className="absolute right-4 top-1/2 -translate-y-1/2 font-black text-gray-400 text-sm">
                      kg
                    </span>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1 uppercase tracking-wide">
                    Data da Pesagem *
                  </label>
                  <input
                    type="date"
                    required
                    value={newWeightDate}
                    onChange={(e) => setNewWeightDate(e.target.value)}
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl py-2.5 px-3.5 text-sm focus:outline-none focus:border-amber-500 focus:bg-white transition-all"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1 uppercase tracking-wide">
                    Observações (Opcional)
                  </label>
                  <input
                    type="text"
                    placeholder="Ex: Pesagem pós-consulta, em jejum..."
                    value={newWeightNotes}
                    onChange={(e) => setNewWeightNotes(e.target.value)}
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl py-2.5 px-3.5 text-sm focus:outline-none focus:border-amber-500 focus:bg-white transition-all"
                  />
                </div>

                <div className="pt-2">
                  <button
                    type="submit"
                    className="w-full py-3 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white rounded-xl font-bold text-sm shadow-md shadow-amber-500/20 transition-all cursor-pointer"
                  >
                    Salvar Pesagem
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Modal: RG Digital & Coleira QR Code */}
      <PetRescueModal
        isOpen={isRgModalOpen}
        onClose={() => setIsRgModalOpen(false)}
        ownerViewPet={selectedPet}
        ownerName={currentUser.name}
        ownerPhone={currentUser.phone}
        ownerEmail={currentUser.email}
      />

    </div>
  );
}

// Preset Chip helper
function PresetChip({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="px-3 py-1.5 rounded-full text-xs font-bold bg-orange-50/80 hover:bg-[#f08136] text-[#f08136] hover:text-white border border-orange-200/60 transition-all cursor-pointer whitespace-nowrap active:scale-95"
    >
      {label}
    </button>
  );
}
