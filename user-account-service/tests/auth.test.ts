import request from 'supertest';
import app from '../src/app';
import { UserRepository } from '../src/repositories/user.repository';
import { AuthService } from '../src/services/auth.service';

jest.mock('../src/repositories/user.repository');
jest.mock('../src/services/auth.service');

describe('Auth Controller', () => {
  const userRepository = new UserRepository();
  const authService = new AuthService(userRepository);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /register', () => {
    it('should register a new user', async () => {
      const newUser = {
        username: 'testuser',
        email: 'test@example.com',
        password: 'password123',
      };

      (authService.createUser as jest.Mock).mockResolvedValue(newUser);

      const response = await request(app)
        .post('/register')
        .send(newUser);

      expect(response.status).toBe(201);
      expect(response.body).toEqual(newUser);
    });

    it('should return 400 if user already exists', async () => {
      const existingUser = {
        username: 'testuser',
        email: 'test@example.com',
        password: 'password123',
      };

      (authService.createUser as jest.Mock).mockRejectedValue(new Error('User already exists'));

      const response = await request(app)
        .post('/register')
        .send(existingUser);

      expect(response.status).toBe(400);
      expect(response.body.message).toBe('User already exists');
    });
  });

  describe('POST /login', () => {
    it('should log in an existing user', async () => {
      const userCredentials = {
        email: 'test@example.com',
        password: 'password123',
      };

      const token = 'mocked_token';
      (authService.validateUser as jest.Mock).mockResolvedValue(token);

      const response = await request(app)
        .post('/login')
        .send(userCredentials);

      expect(response.status).toBe(200);
      expect(response.body.token).toBe(token);
    });

    it('should return 401 if credentials are invalid', async () => {
      const invalidCredentials = {
        email: 'test@example.com',
        password: 'wrongpassword',
      };

      (authService.validateUser as jest.Mock).mockRejectedValue(new Error('Invalid credentials'));

      const response = await request(app)
        .post('/login')
        .send(invalidCredentials);

      expect(response.status).toBe(401);
      expect(response.body.message).toBe('Invalid credentials');
    });
  });
});