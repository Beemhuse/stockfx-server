import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { User } from '../models/user.model';
import { AuthService } from '../services/auth.service';

const authService = new AuthService();

export const verifyToken = (req: Request, res: Response, next: NextFunction) => {
  const token = req.headers['authorization']?.split(' ')[1];

  if (!token) {
    return res.status(403).send({ message: 'No token provided!' });
  }

  jwt.verify(token, process.env.JWT_SECRET as string, (err: any, decoded: any) => {
    if (err) {
      return res.status(401).send({ message: 'Unauthorized!' });
    }
    req.userId = decoded.id;
    next();
  });
};

export const isAuthenticated = async (req: Request, res: Response, next: NextFunction) => {
  const user = await authService.getUserById(req.userId);
  if (!user) {
    return res.status(404).send({ message: 'User not found!' });
  }
  next();
};