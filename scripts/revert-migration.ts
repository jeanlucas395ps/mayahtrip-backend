import { dataSource } from '../src/data-source';

async function main(): Promise<void> {
  await dataSource.initialize();
  await dataSource.undoLastMigration();
  await dataSource.destroy();
}

main().catch((erro) => {
  console.error(erro);
  process.exit(1);
});
