interface User {
    id: string;
    username: string;
    email: string;
    password: string;
}

interface AuthResponse {
    token: string;
    user: User;
}

interface RegisterUserInput {
    username: string;
    email: string;
    password: string;
}

interface LoginUserInput {
    email: string;
    password: string;
}