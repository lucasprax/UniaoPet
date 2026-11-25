# 🛡️ Guia de Preservação e Segurança de Dados em Deploys — UniãoPet

Este guia explica como atualizar e fazer novos deploys do **UniãoPet** no servidor **sem nunca apagar, substituir ou quebrar** os dados reais de usuários, pets, vacinas e postagens.

---

## 📁 Onde os dados ficam salvos?

1. **Pasta de Dados Isolada**:
   - O banco de dados agora fica exclusivamente no diretório:
     `data/uniao_pet_db.json`
2. **Backups Automáticos Rotativos**:
   - A cada inicialização ou reinício do servidor, um snapshot de segurança é criado em:
     `data/backups/uniao_pet_db_auto_AAAA-MM-DD_HH-mm-ss.json`
   - O sistema guarda automaticamente os últimos 15 backups e descarta os mais antigos para economizar disco.
3. **Auto-Recuperação Inteligente**:
   - Se por qualquer motivo o arquivo principal for corrompido ou ficar vazio (0 bytes), o servidor detecta na hora e **restaura automaticamente o último backup íntegro**, sem deixar o app fora do ar.

---

## 🚀 Regra de Ouro para Atualizações no Servidor (Deploy)

> [!IMPORTANT]
> **NUNCA substitua a pasta `data/` ao enviar novos arquivos para o servidor!**

### Como atualizar o servidor com segurança:

1. **Via Upload de Arquivos / FTP / Painel (cPanel, Hostinger, VPS, etc.)**:
   - Ao fazer upload do código atualizado, envie as pastas `dist/`, `dist-server/`, `package.json`, etc.
   - **NÃO envie nem substitua a pasta `data/` nem o arquivo `uniao_pet_db.json`**.
   - Os dados existentes no servidor continuarão exatamente onde estavam.

2. **Via Linha de Comando no Servidor**:
   - Você pode rodar:
     ```bash
     npm run update:safe
     ```
   - Esse script cria um backup pré-deploy imediato, compila a aplicação com Vite e esbuild, e valida se o banco está 100% intacto.

3. **Se usar variável de ambiente para banco externo**:
   - Se preferir que o banco fique em um volume persistente (ex: Docker, Railway, Render), basta definir a variável:
     ```env
     DB_PATH=/caminho/do/volume/uniao_pet_db.json
     ```

---

## 🔒 Proteções Automáticas Embutidas no Código

- **Trava contra Gravação Vazia (Blank Overwrite Guard)**: Se o servidor subir com a memória vazia por qualquer anomalia e tentar salvar 0 registros por cima de um banco que já tem usuários reais, a gravação é bloqueada na hora.
- **Gravação Atômica**: O servidor grava primeiro em um arquivo `.tmp` e só renomeia quando o JSON estiver 100% gravado, evitando arquivos corrompidos em caso de queda de energia.
- **Tolerância a Esquemas (Zero Quebras)**: Novas funcionalidades (ex: novas propriedades em pets, posts ou usuários) são automaticamente mescladas com valores padrão, sem dar erro em dados antigos.

---

## 📥 Backup com 1 Clique pela Interface

Você ou o administrador podem baixar uma cópia completa dos dados a qualquer momento:
1. Abra o app no navegador.
2. Acesse a aba **Perfil**.
3. Na seção **Segurança e Dados**, clique no botão:
   **"📥 Baixar Backup Completo (.json)"**.
4. O arquivo com todos os dados atuais será salvo no seu computador.
