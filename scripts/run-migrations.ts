import { dataSource } from '../src/data-source';

async function main(): Promise<void> {
  await dataSource.initialize();
  const executadas = await dataSource.runMigrations();
  console.log(`Migrations executadas: ${executadas.length}`);
  executadas.forEach((m) => console.log(` - ${m.name}`));
  await dataSource.destroy();
}

main().catch((erro) => {
  console.error(erro);
  process.exit(1);
});
