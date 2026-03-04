import { Request, Response } from 'express';
import AuthService from '../services/auth.service';

class AuthController {
  private authService: AuthService;

  constructor() {
    this.authService = new AuthService();
  }

  public async registerUser(req: Request, res: Response): Promise<Response> {
    try {
      const userData = req.body;
      const newUser = await this.authService.createUser(userData);
      return res.status(201).json(newUser);
    } catch (error) {
      return res.status(400).json({ message: error.message });
    }
  }

  public async loginUser(req: Request, res: Response): Promise<Response> {
    try {
      const { email, password } = req.body;
      const user = await this.authService.validateUser(email, password);
      if (!user) {
        return res.status(401).json({ message: 'Invalid credentials' });
      }
      return res.status(200).json({ message: 'Login successful', user });
    } catch (error) {
      return res.status(400).json({ message: error.message });
    }
  }
}

export default AuthController;