import supabase, { dbUser } from '../src/lib/sharedDb';

(async () => {
  try {
    console.log('Supabase client present:', !!supabase);
    const email = 'local@example.com';
    const user = await dbUser.findByEmail(email);
    console.log('dbUser.findByEmail result for', email, ':', user);
  } catch (err) {
    console.error('Error checking user:', err);
    process.exitCode = 1;
  }
})();
