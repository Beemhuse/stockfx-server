import User from '../models/user.model';
import { dbUser } from '../lib/sharedDb'; // Update this path to match your actual file location

export type DbUserRecord = {
  id: string;
  username: string;
  email: string;
  password?: string;
  [key: string]: any;
};

export class UserRepository {
  /**
   * Create a new user in centralized Supabase
   */
  async createUser(data: DbUserRecord): Promise<DbUserRecord> {
    const result = await dbUser.create(data.email, data.password || '');
    return {
      id: result.id,
      username: data.username,
      email: result.email,
      password: data.password || '',
    };
  }

  /**
   * Find user by ID in centralized Supabase
   */
  async findUserById(id: string): Promise<DbUserRecord | null> {
    const result = await dbUser.findById(id);
    if (!result) return null;
    return {
      id: result.id,
      username: result.username,
      email: result.email,
      password: result.password || '',
    };
  }

  /**
   * Find user by email in centralized Supabase
   */
  async findUserByEmail(email: string): Promise<DbUserRecord | null> {
    const result = await dbUser.findByEmail(email);
    if (!result) return null;
    return {
      id: result.id,
      username: result.username,
      email: result.email,
      password: result.password || '',
    };
  }

  /**
   * Update user in centralized Supabase
   */
  async updateUser(id: string, data: Partial<DbUserRecord>): Promise<DbUserRecord> {
    const result = await dbUser.update(id, data);
    return {
      id: result.id,
      username: result.username,
      email: result.email,
      password: result.password || '',
    };
  }

  /**
   * Delete user from centralized Supabase (note: Supabase doesn't expose direct delete via sharedDb.js yet)
   * Will need custom implementation if required
   */
  async deleteUser(id: string): Promise<DbUserRecord> {
    throw new Error('Delete user not yet implemented in sharedDb.js');
  }
}