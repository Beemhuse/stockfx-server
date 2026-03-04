import { UserRepository } from '../repositories/user.repository';
import { hashPassword } from '../utils/hash.util';

export class AuthService {
    private userRepository: UserRepository;

    constructor() {
        this.userRepository = new UserRepository();
    }

    async createUser(username: string, email: string, password: string) {
        const hashedPassword = await hashPassword(password);
        const user = {
            username,
            email,
            password: hashedPassword,
        };
        return this.userRepository.saveUser(user);
    }

    async validateUser(email: string, password: string) {
        const user = await this.userRepository.findUserByEmail(email);
        if (user && await comparePassword(password, user.password)) {
            return user;
        }
        return null;
    }
}