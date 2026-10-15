import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import {
  importJsonData,
} from '../serverStore';
import type { OutboxEntry, StoredSubmission } from '../serverEmailAndExcel';

function readJsonFile<T>(filename: string): T[] {
  const filepath = path.resolve(process.cwd(), filename);
  if (!fs.existsSync(filepath)) return [];
  return JSON.parse(fs.readFileSync(filepath, 'utf8')) as T[];
}

async function main() {
  const submissions = readJsonFile<StoredSubmission>('submissions.json');
  const outbox = readJsonFile<OutboxEntry>('email_outbox.json');
  await importJsonData(submissions, outbox);
  console.log(`Imported ${submissions.length} submissions and ${outbox.length} outbox entries into Firestore.`);
}

main().catch((error) => {
  console.error('Firestore migration failed:', error);
  process.exitCode = 1;
});