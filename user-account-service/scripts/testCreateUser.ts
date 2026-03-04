import path from 'path';
import { config as dotenvConfig } from 'dotenv';

// Load .env FIRST before any other imports
const result = dotenvConfig({ path: path.resolve(__dirname, '../.env') });
console.log('[test] dotenv load result:', result.parsed ? 'SUCCESS' : 'FAILED');
if (result.parsed) {
  console.log('[test] loaded keys:', Object.keys(result.parsed));
}

import supabase, { dbUser } from '../src/lib/sharedDb';

console.log('[testCreateUser.ts] supabase client exists:', !!supabase);
console.log('[testCreateUser.ts] SUPABASE_URL from env:', process.env.SUPABASE_URL ? process.env.SUPABASE_URL.substring(0, 20) + '...' : 'NOT SET');
console.log('[testCreateUser.ts] SUPABASE_SERVICE_ROLE_KEY from env:', process.env.SUPABASE_SERVICE_ROLE_KEY ? 'SET (length: ' + process.env.SUPABASE_SERVICE_ROLE_KEY.length + ')' : 'NOT SET');

(async () => {
  try {
    const repo = new (await import('../src/repositories/user.repository')).UserRepository();
    const created = await repo.createUser({ username: 'localtest', email: 'test-' + Date.now() + '@example.com', password: 'LocalPass123!' } as any);
    console.log('Created user (local):', created);
  } catch (err) {
    console.error('Error creating user (local):', err);
    process.exitCode = 1;
  }
})();
