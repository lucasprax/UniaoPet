# UniãoPet

Comunidade para adoção, doação, localização de pets perdidos, carteira de vacinação e chat em tempo real.

## Como rodar localmente

**Pré-requisitos:** Node.js

1. Instale as dependências:
   ```bash
   npm install
   ```
2. Configure as variáveis de ambiente no arquivo `.env.local` (não versionado):
   - `AUTH_SECRET` — chave secreta forte para assinatura de tokens de autenticação (obrigatório em produção)
   - `ADMIN_SECRET` — segredo opcional para proteger endpoints administrativos de backup
   - `GEMINI_API_KEY` — chave da API Gemini (opcional, para OCR de vacinas e triagem veterinária)
   - `DATABASE_URL` — string de conexão PostgreSQL (opcional; sem ela, usa persistência local em `data/uniao_pet_db.json`)
3. Inicie o ambiente de desenvolvimento:
   ```bash
   npm run dev
   ```
