#!/usr/bin/env node

/**
 * UniãoPet - Safe Deploy & Update Script
 * 
 * Esse script garante que qualquer compilação ou atualização do servidor
 * NUNCA sobrescreva, corrompa ou apague os dados de produção.
 */

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

console.log('\n======================================================');
console.log(' 🛡️  UniãoPet — Rotina de Atualização Segura (Safe Deploy)');
console.log('======================================================\n');

const cwd = process.cwd();
const dataDir = path.resolve(cwd, 'data');
const backupsDir = path.join(dataDir, 'backups');
const dbInData = path.join(dataDir, 'uniao_pet_db.json');
const dbInRoot = path.resolve(cwd, 'uniao_pet_db.json');

// 1. Localizar banco existente
let currentDb = null;
if (fs.existsSync(dbInData)) {
  currentDb = dbInData;
} else if (fs.existsSync(dbInRoot)) {
  currentDb = dbInRoot;
}

if (currentDb) {
  console.log(`[Passo 1/4] Banco de dados localizado: ${currentDb}`);
  try {
    const raw = fs.readFileSync(currentDb, 'utf8');
    const parsed = JSON.parse(raw);
    const usersCount = parsed.users ? parsed.users.length : 0;
    const petsCount = parsed.pets ? parsed.pets.length : 0;
    const postsCount = parsed.posts ? parsed.posts.length : 0;

    console.log(` ✔ Integridade verificada: ${usersCount} usuários, ${petsCount} pets, ${postsCount} posts.`);

    // Criar backup pré-deploy imediato
    if (!fs.existsSync(backupsDir)) {
      fs.mkdirSync(backupsDir, { recursive: true });
    }
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupTarget = path.join(backupsDir, `uniao_pet_db_predeploy_${timestamp}.json`);
    fs.copyFileSync(currentDb, backupTarget);
    console.log(` ✔ Snapshot de segurança criado em: ${backupTarget}`);
  } catch (err) {
    console.error(' ⚠️  Alerta ao verificar banco atual:', err.message);
  }
} else {
  console.log('[Passo 1/4] Nenhum banco anterior detectado. Um novo será inicializado com segurança.');
}

// 2. Compilar aplicação frontend e servidor
console.log('\n[Passo 2/4] Executando build de produção (Vite + esbuild)...');
try {
  execSync('npx vite build', { stdio: 'inherit' });
  execSync('npx esbuild server.ts --bundle --platform=node --format=esm --outdir=dist-server --packages=external', { stdio: 'inherit' });
  console.log(' ✔ Build concluído com sucesso!');
} catch (err) {
  console.error('\n ❌ Erro durante a compilação do projeto. A atualização foi interrompida.');
  process.exit(1);
}

// 3. Garantir isolamento do banco no diretório data/
console.log('\n[Passo 3/4] Validando persistência de dados em data/uniao_pet_db.json...');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

if (!fs.existsSync(dbInData) && fs.existsSync(dbInRoot)) {
  fs.copyFileSync(dbInRoot, dbInData);
  console.log(' ✔ Dados migrados com segurança para a pasta data/.');
}

// 4. Verificação final
if (fs.existsSync(dbInData)) {
  try {
    const finalRaw = fs.readFileSync(dbInData, 'utf8');
    const finalParsed = JSON.parse(finalRaw);
    console.log(` ✔ Confirmação: Banco intacto com ${finalParsed.users?.length || 0} usuários e ${finalParsed.pets?.length || 0} pets.`);
  } catch (e) {
    console.error(' ⚠️  Erro na checagem final do banco:', e.message);
  }
}

console.log('\n======================================================');
console.log(' 🎉 Atualização Segura Concluída!');
console.log(' ➜ Para iniciar o servidor: npm start');
console.log(' 💡 Dica para deploys: Nunca substitua a pasta "data/" ao subir arquivos para o servidor.');
console.log('======================================================\n');
