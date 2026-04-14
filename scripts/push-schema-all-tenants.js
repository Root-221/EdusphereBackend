const { PrismaClient } = require('@prisma/client');

const centralDb = new PrismaClient();

const FORCE_MODE = process.argv.includes('--force');

async function pushSchemaToAllTenants() {
  console.log('🔄 Récupération des écoles actives...\n');

  const schools = await centralDb.school.findMany({
    where: FORCE_MODE ? {} : { status: 'ACTIVE' },
    select: { id: true, name: true, slug: true, databaseUrl: true },
  });

  console.log(`Trouvées: ${schools.length} école(s)${FORCE_MODE ? ' (mode force)' : ''}\n`);

  let successCount = 0;
  let errorCount = 0;

  for (const school of schools) {
    if (!school.databaseUrl) {
      console.log(`⏭️  ${school.name}: Pas d'URL de base de données, ignoré`);
      continue;
    }

    console.log(`📦 Traitement de: ${school.name} (${school.slug})`);
    console.log(`   Base: ${school.databaseUrl}`);

    try {
      const { spawnSync } = require('child_process');
      
      const args = ['prisma', 'db', 'push', '--schema=prisma/tenant/schema.prisma', '--skip-generate'];
      if (FORCE_MODE) {
        args.push('--accept-data-loss');
      }
      
      const result = spawnSync('npx', args, {
        stdio: 'pipe',
        env: {
          ...process.env,
          DATABASE_URL: school.databaseUrl,
        },
        encoding: 'utf-8',
      });

      if (result.status === 0) {
        console.log(`   ✅ Schéma appliqué avec succès`);
        successCount++;
      } else {
        console.log(`   ❌ Erreur: ${result.stderr?.substring(0, 100) || 'Inconnu'}`);
        errorCount++;
      }
    } catch (error) {
      console.log(`   ❌ Exception: ${error.message}`);
      errorCount++;
    }

    console.log('');
  }

  console.log('═══════════════════════════════════════');
  console.log(`✅ Terminé: ${successCount} succès, ${errorCount} erreur(s)`);
  console.log('═══════════════════════════════════════');

  await centralDb.$disconnect();
  process.exit(errorCount > 0 ? 1 : 0);
}

pushSchemaToAllTenants().catch(async (error) => {
  console.error('❌ Erreur fatale:', error);
  await centralDb.$disconnect();
  process.exit(1);
});
