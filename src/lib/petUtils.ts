import { Post, PetRecord, VaccineRecord } from '../types';

// ── 1. URLs & Deep Links ─────────────────────────────────────────────────────
export function getAppBaseUrl(): string {
  if (typeof window === 'undefined') return '';
  const baseUrl = ((import.meta as any).env?.BASE_URL || '/').replace(/\/$/, '');
  return `${window.location.origin}${baseUrl}`;
}

export function getPostDeepLink(postId: string): string {
  return `${getAppBaseUrl()}/#post-${postId}`;
}

export function getPetRescueLink(petId: string): string {
  return `${getAppBaseUrl()}/#rg-pet-${petId}`;
}

/** High-resolution scannable QR Code image URL (with margin & dark contrast) */
export function getQrCodeImageUrl(data: string, size = 260): string {
  return `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&margin=8&color=0f172a&bgcolor=ffffff&ecc=M&data=${encodeURIComponent(data)}`;
}

// ── 2. RFC 5545 Calendar (.ics) Generator for Vaccines & Medications ─────────
export function downloadCalendarIcs(params: {
  title: string;
  description: string;
  dateStr: string; // YYYY-MM-DD
  location?: string;
  filename?: string;
}) {
  const cleanDate = (params.dateStr || new Date().toISOString().split('T')[0]).replace(/-/g, '');
  const nowStamp = new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
  const uid = `uniaopet-${Date.now()}@uniaopet.app`;

  const icsLines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//UniaoPet//Caderneta Digital Pet//PT-BR',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${nowStamp}`,
    `DTSTART;VALUE=DATE:${cleanDate}`,
    `DTEND;VALUE=DATE:${cleanDate}`,
    `SUMMARY:${params.title.replace(/[\r\n]/g, ' ')}`,
    `DESCRIPTION:${params.description.replace(/[\r\n]/g, '\\n')}`,
    `LOCATION:${(params.location || 'Clínica Veterinária').replace(/[\r\n]/g, ' ')}`,
    'BEGIN:VALARM',
    'TRIGGER:-PT24H',
    'ACTION:DISPLAY',
    `DESCRIPTION:Lembrete UniãoPet: ${params.title}`,
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR'
  ].join('\r\n');

  const blob = new Blob([icsLines], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = params.filename || `lembrete-uniaopet-${cleanDate}.ics`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function exportVaccineToCalendar(pet: PetRecord, vaccine: VaccineRecord) {
  const targetDate = vaccine.nextDueDate || vaccine.dateApplied;
  downloadCalendarIcs({
    title: `🐾 Reforço ${vaccine.name} — ${pet.name}`,
    description: `Lembrete da Caderneta Digital UniãoPet para o pet ${pet.name} (${pet.breed || 'SRD'}).\nVacina/Cuidado: ${vaccine.name}\nVeterinário: ${vaccine.veterinarian || 'Não informado'}\nClínica: ${vaccine.clinic || 'Não informada'}`,
    dateStr: targetDate,
    location: vaccine.clinic || 'Clínica Veterinária',
    filename: `vacina-${pet.name.toLowerCase().replace(/\s+/g, '-')}-${targetDate}.ics`
  });
}

// ── 3. Geolocation, Coordinates & Haversine Distance ─────────────────────────
const CITY_COORDS: Array<{ keywords: string[]; lat: number; lng: number }> = [
  { keywords: ['sao paulo', 'sp', 'centro', 'paulista', 'pinheiros', 'moema', 'vila mariana', 'tatuape', 'itaim'], lat: -23.5505, lng: -46.6333 },
  { keywords: ['rio de janeiro', 'rj', 'copacabana', 'ipanema', 'barra', 'botafogo', 'tijuca', 'niteroi'], lat: -22.9068, lng: -43.1729 },
  { keywords: ['belo horizonte', 'bh', 'mg', 'savassi', 'pampulha', 'contagem'], lat: -19.9167, lng: -43.9345 },
  { keywords: ['curitiba', 'pr', 'batel', 'agua verde'], lat: -25.4284, lng: -49.2733 },
  { keywords: ['porto alegre', 'rs', 'moinhos', 'cidade baixa'], lat: -30.0346, lng: -51.2177 },
  { keywords: ['brasilia', 'df', 'asa sul', 'asa norte', 'taguatinga'], lat: -15.7975, lng: -47.8919 },
  { keywords: ['salvador', 'ba', 'pituba', 'barra'], lat: -12.9714, lng: -38.5014 },
  { keywords: ['fortaleza', 'ce', 'aldeota', 'meireles'], lat: -3.7172, lng: -38.5433 },
  { keywords: ['recife', 'pe', 'boa viagem', 'olinda'], lat: -8.0476, lng: -34.877 },
  { keywords: ['campinas', 'cambui', 'barao geraldo'], lat: -22.9099, lng: -47.0626 },
  { keywords: ['florianopolis', 'sc', 'trindade', 'campeche'], lat: -27.5954, lng: -48.548 },
  { keywords: ['goiania', 'go', 'setor bueno'], lat: -16.6869, lng: -49.2648 }
];

function deterministicHash(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

/** Resolves real or deterministic neighborhood coordinates for map pins */
export function resolvePostCoordinates(post: Post): { lat: number; lng: number; isExactGps: boolean } {
  if (typeof post.lat === 'number' && typeof post.lng === 'number' && !isNaN(post.lat) && !isNaN(post.lng)) {
    return { lat: post.lat, lng: post.lng, isExactGps: true };
  }

  const norm = (post.location || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

  const matched = CITY_COORDS.find(c => c.keywords.some(k => norm.includes(k))) || CITY_COORDS[0];
  const h1 = deterministicHash(post.id + norm);
  const h2 = deterministicHash(norm + (post.petName || ''));
  const offsetLat = ((h1 % 1000) / 1000 - 0.5) * 0.045;
  const offsetLng = ((h2 % 1000) / 1000 - 0.5) * 0.045;

  return {
    lat: +(matched.lat + offsetLat).toFixed(5),
    lng: +(matched.lng + offsetLng).toFixed(5),
    isExactGps: false
  };
}

/** Calculates Haversine distance in kilometers between two coordinates */
export function calculateDistanceKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return +(R * c).toFixed(1);
}

// ── 4. High-Res 1080x1920 Story Poster Generator (Canvas PNG) ────────────────
function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
  maxLines = 4
): number {
  const words = (text || '').split(/\s+/);
  let line = '';
  let currentY = y;
  let linesCount = 0;

  for (let n = 0; n < words.length; n++) {
    const testLine = line + words[n] + ' ';
    const metrics = ctx.measureText(testLine);
    if (metrics.width > maxWidth && n > 0) {
      linesCount++;
      if (linesCount >= maxLines) {
        ctx.fillText(line.trim() + '...', x, currentY);
        return currentY + lineHeight;
      }
      ctx.fillText(line.trim(), x, currentY);
      line = words[n] + ' ';
      currentY += lineHeight;
    } else {
      line = testLine;
    }
  }
  if (line.trim()) {
    ctx.fillText(line.trim(), x, currentY);
    currentY += lineHeight;
  }
  return currentY;
}

export async function generateStoryFlyerPng(post: Post): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = 1080;
  canvas.height = 1920;
  const ctx = canvas.getContext('2d')!;

  const isDesaparecido = post.category === 'desaparecido';
  const isAdocao = post.category === 'adoção' || post.category === 'adocao';

  // Background gradient
  const bgGrad = ctx.createLinearGradient(0, 0, 1080, 1920);
  if (isDesaparecido) {
    bgGrad.addColorStop(0, '#991b1b');
    bgGrad.addColorStop(0.5, '#dc2626');
    bgGrad.addColorStop(1, '#7f1d1d');
  } else if (isAdocao) {
    bgGrad.addColorStop(0, '#065f46');
    bgGrad.addColorStop(0.5, '#059669');
    bgGrad.addColorStop(1, '#064e3b');
  } else {
    bgGrad.addColorStop(0, '#c2410c');
    bgGrad.addColorStop(0.5, '#f08136');
    bgGrad.addColorStop(1, '#9a3412');
  }
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, 1080, 1920);

  // Main White Card
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.roundRect(64, 180, 952, 1580, 48);
  ctx.fill();

  // Top Header Pill
  const titleBanner = isDesaparecido
    ? '🚨 PROCURA-SE URGENTE'
    : isAdocao
    ? '❤️ ME ADOTE COM AMOR'
    : '🎁 DOAÇÃO SOLIDÁRIA';

  ctx.fillStyle = '#ffffff';
  ctx.font = '900 54px Outfit, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(titleBanner, 540, 118);

  // Draw Pet Image
  try {
    if (post.imageUrl) {
      const petImg = await loadImage(post.imageUrl);
      ctx.save();
      ctx.beginPath();
      ctx.roundRect(104, 220, 872, 680, 36);
      ctx.clip();
      const scale = Math.max(872 / petImg.width, 680 / petImg.height);
      const w = petImg.width * scale;
      const h = petImg.height * scale;
      ctx.drawImage(petImg, 104 + (872 - w) / 2, 220 + (680 - h) / 2, w, h);
      ctx.restore();
    }
  } catch {
    ctx.fillStyle = '#f1f5f9';
    ctx.beginPath();
    ctx.roundRect(104, 220, 872, 680, 36);
    ctx.fill();
  }

  // Pet Name
  ctx.fillStyle = '#0f172a';
  ctx.font = '900 72px Outfit, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText((post.petName || post.title).toUpperCase().slice(0, 22), 540, 995);

  // Location Pill
  ctx.fillStyle = '#fff7ed';
  ctx.beginPath();
  ctx.roundRect(160, 1030, 760, 78, 39);
  ctx.fill();
  ctx.fillStyle = '#ea580c';
  ctx.font = '800 34px Outfit, sans-serif';
  ctx.fillText(`📍 ${(post.location || 'Local não informado').slice(0, 36)}`, 540, 1081);

  // Description
  ctx.fillStyle = '#334155';
  ctx.font = '500 34px Outfit, sans-serif';
  ctx.textAlign = 'center';
  wrapText(ctx, post.description || post.title, 540, 1175, 820, 48, 4);

  // Bottom Contact + QR Box
  ctx.fillStyle = '#fef08a';
  ctx.beginPath();
  ctx.roundRect(104, 1390, 872, 320, 36);
  ctx.fill();

  ctx.textAlign = 'left';
  ctx.fillStyle = '#713f12';
  ctx.font = '800 26px Outfit, sans-serif';
  ctx.fillText(isDesaparecido ? 'VIU ESTE PET? LIGUE OU CHAME NO WHATSAPP:' : 'INTERESSADO? FALE COM O TUTOR:', 144, 1455);

  ctx.fillStyle = '#0f172a';
  ctx.font = '900 56px JetBrains Mono, monospace';
  ctx.fillText(post.phone || 'Via Chat UniãoPet', 144, 1535);

  ctx.fillStyle = '#475569';
  ctx.font = '700 30px Outfit, sans-serif';
  ctx.fillText(`Tutor(a): ${post.authorName || 'Comunidade UniãoPet'}`, 144, 1595);
  ctx.fillStyle = '#ea580c';
  ctx.font = '800 26px Outfit, sans-serif';
  ctx.fillText('Escaneie o QR Code para abrir o anúncio →', 144, 1655);

  // Draw QR Code on the right of the yellow box
  try {
    const qrImg = await loadImage(getQrCodeImageUrl(getPostDeepLink(post.id), 240));
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.roundRect(720, 1430, 220, 220, 24);
    ctx.fill();
    ctx.drawImage(qrImg, 730, 1440, 200, 200);
  } catch {}

  // Footer Brand
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffffff';
  ctx.font = '800 32px Outfit, sans-serif';
  ctx.fillText('🐾 UniãoPet • Proteção e Cuidado Animal', 540, 1845);

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('Falha ao renderizar imagem do cartaz'));
    }, 'image/png');
  });
}
