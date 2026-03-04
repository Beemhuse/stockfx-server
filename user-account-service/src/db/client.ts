import { dbUser, dbUserAccount, dbSession } from './queries';

async function initializeData(userId: string) {
  const userData = await dbUser(userId);
  const accountData = await dbUserAccount(userId);
  const sessionData = await dbSession(userId);
}

export {};