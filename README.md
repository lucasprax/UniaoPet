<div align="center">

# 🐾 UniãoPet

### Plataforma Comunitária para Adoção, Resgate, Localização e Saúde Animal

![React](https://img.shields.io/badge/React-19-61DAFB?style=for-the-badge&logo=react&logoColor=black)
![TypeScript](https://img.shields.io/badge/TypeScript-5.8-3178C6?style=for-the-badge&logo=typescript&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-6-646CFF?style=for-the-badge&logo=vite&logoColor=white)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-4-06B6D4?style=for-the-badge&logo=tailwindcss&logoColor=white)
![Express](https://img.shields.io/badge/Express-4-000000?style=for-the-badge&logo=express&logoColor=white)
![Gemini AI](https://img.shields.io/badge/Google_Gemini-AI-4285F4?style=for-the-badge&logo=googlegemini&logoColor=white)

*Trabalho de Conclusão de Curso (TCC) — Ensino Técnico em Informática*  
**Escola Estadual de Tempo Integral Francisco Antônio Medeiros • 2026**

</div>

---

## 📖 Sobre o Projeto

O **UniãoPet** é uma aplicação web completa (PWA) desenvolvida com o objetivo de conectar tutores, protetores e pessoas interessadas em **adoção responsável**, **doação** e **resgate de animais desaparecidos**, além de oferecer ferramentas digitais para o **acompanhamento da saúde pet** (carteira de vacinação, medicações, peso e triagem veterinária de emergência).

O sistema foi idealizado e desenvolvido como **Trabalho de Conclusão de Curso (TCC)** pelo aluno **Alessandro**, do curso de **Ensino Técnico em Informática** da **Escola Estadual de Tempo Integral Francisco Antônio Medeiros**, no ano de **2026**.

---

## ✨ Principais Funcionalidades

### 📢 Feed Comunitário e Resgate
- Publicações organizadas por categoria: **Desaparecido**, **Adoção** e **Doação**.
- Curtidas, comentários, salvamento de postagens e busca por localização integrada ao **Google Maps**.
- Contato rápido via **WhatsApp** diretamente pela publicação.
- **Gerador de Cartaz (Flyer)** para impressão e compartilhamento de pets desaparecidos.
- **Matching Inteligente**: cruzamento automático de características e localização entre publicações compatíveis.

### 💉 Carteira de Vacinação e Saúde Digital
- Cadastro completo do pet: espécie, raça, data de nascimento, sexo, microchip, alergias, castração e tipo sanguíneo.
- Controle de **vacinas, vermífugos, antipulgas e consultas** com alerta automático de status (*em dia*, *próximo* e *atrasado*).
- **Leitura Óptica por IA (OCR)**: escaneamento de foto da carteira de vacinação física usando **Gemini Vision** (com fallback inteligente).
- Controle de **medicações** (dosagem, frequência e registro de doses tomadas) e **histórico de peso**.

### 🏷️ RG Pet & Resgate via QR Code na Coleira
- Geração de QR Code vinculado ao perfil público de resgate do animal (`#rg-pet-<id>`).
- Qualquer pessoa que encontrar o pet pode escanear a coleira para visualizar a ficha do animal, acionar o tutor pelo WhatsApp com **localização GPS** e consultar o veterinário de emergência.

### 💬 Chat em Tempo Real
- Conversas diretas entre tutores e interessados em adoção ou resgate.
- Envio de mensagens de texto, imagens e compartilhamento de publicações do feed.
- Indicador de mensagens não lidas e status de presença online.

### 🚨 Central de Emergência e Triagem Veterinária
- Assistente de **triagem clínica e toxicologia veterinária** com classificação de urgência (*crítica*, *alta*, *moderada*, *baixa*) alimentado pelo **Google Gemini AI** e motor clínico determinístico de fallback.
- Cadastro do veterinário/clínica 24h de confiança com acesso rápido ao telefone e rota no mapa.

### 🔐 Segurança e Persistência de Dados
- Senhas protegidas com hash criptográfico **`scrypt`** e sal aleatório.
- Sessões autenticadas por tokens assinados com **HMAC-SHA256**.
- Suporte flexível a **PostgreSQL**, **Firebase/Firestore** ou banco local JSON com gravação atômica, backups rotativos e exportação/restauração autenticada.

---

## 🛠️ Tecnologias Utilizadas

| Camada | Tecnologias |
| :--- | :--- |
| **Frontend** | React 19, TypeScript, Vite 6, Tailwind CSS 4, Motion, Lucide React, React Hot Toast |
| **Backend** | Node.js, Express 4, Compression, Crypto (`scrypt` / HMAC-SHA256) |
| **Inteligência Artificial** | Google Gemini API (`@google/genai` — `gemini-2.5-flash`) |
| **Banco de Dados** | PostgreSQL (`pg`), Firebase/Firestore (opcional) e JSON local com cache em memória |
| **PWA & Deploy** | Web App Manifest, Service Worker, Vercel Serverless e suporte a VPS Linux (`systemd`) |

---

## 📁 Estrutura do Projeto

```text
UniaoPET/
├── api/                     # Entrypoint serverless (Vercel)
├── public/                  # Ícones, manifest.json e Service Worker (PWA)
├── scripts/                 # Script de atualização e backup seguro (safe-deploy.js)
├── src/
│   ├── components/          # Telas e modais (Feed, Chat, Vacinas, Perfil, Flyer, Emergência, Resgate)
│   ├── lib/                 # Contexto de autenticação, cliente da API, compressão de imagem e utilitários
│   ├── server/              # API Express (api.ts) e camada de persistência/backup (db.ts)
│   ├── App.tsx              # Componente principal e roteamento de abas/deep-links
│   └── types.ts             # Tipagens TypeScript da aplicação
├── server.ts                # Servidor de produção Express + arquivos estáticos
├── DEPLOY_GUIA_DADOS.md     # Guia de preservação de dados e backups em produção
└── package.json             # Dependências e scripts NPM
```

---

## 🚀 Como Executar Localmente

### Pré-requisitos
- **Node.js** (versão 18 ou superior)
- **npm**

### Passo a passo

1. **Clone o repositório:**
   ```bash
   git clone https://github.com/lucasprax/UniaoPet.git
   cd UniaoPet
   ```

2. **Instale as dependências:**
   ```bash
   npm install
   ```

3. **Configure as variáveis de ambiente** (crie um arquivo `.env.local` na raiz do projeto):
   ```env
   # Obrigatório em produção: chave secreta forte para assinatura dos tokens
   AUTH_SECRET=sua_chave_secreta_forte_aqui

   # Opcional: protege as rotas administrativas de backup
   ADMIN_SECRET=seu_segredo_admin_aqui

   # Opcional: habilita OCR de vacinas e triagem veterinária com Gemini AI
   GEMINI_API_KEY=sua_chave_gemini_aqui

   # Opcional: usa PostgreSQL em vez do banco local data/uniao_pet_db.json
   DATABASE_URL=postgres://usuario:senha@host:5432/banco
   ```

4. **Inicie o servidor de desenvolvimento:**
   ```bash
   npm run dev
   ```

5. **Acesse no navegador:**
   ```text
   http://localhost:3000/uniaopet/
   ```

---

## 📜 Scripts Disponíveis

| Comando | Descrição |
| :--- | :--- |
| `npm run dev` | Inicia o frontend Vite com a API Express integrada em modo de desenvolvimento |
| `npm run build` | Gera o build de produção do frontend (`dist/`) e do servidor (`dist-server/`) |
| `npm run start` | Executa o servidor de produção compilado |
| `npm run update:safe` | Cria backup automático do banco e compila o projeto com segurança |
| `npm run lint` | Executa a verificação de tipos com TypeScript (`tsc --noEmit`) |

---

## 🎓 Informações Acadêmicas

- **Projeto:** UniãoPet
- **Tipo:** Trabalho de Conclusão de Curso (TCC)
- **Aluno:** Alessandro
- **Curso:** Ensino Técnico em Informática
- **Instituição:** Escola Estadual de Tempo Integral Francisco Antônio Medeiros
- **Ano:** 2026

---

<div align="center">

Desenvolvido com dedicação para o bem-estar animal 🐶🐱

</div>
