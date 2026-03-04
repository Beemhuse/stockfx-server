# User Account Service

This project is a backend service for user account management, enabling user registration, login, and data storage. It is built using TypeScript and Express, and it utilizes Prisma for database interactions.

## Features

- User registration and login
- Password hashing and validation
- Middleware for authentication
- Unit tests for authentication functionality
- Docker support for easy deployment

## Project Structure

```
user-account-service
├── src
│   ├── index.ts                # Entry point of the application
│   ├── app.ts                  # Express application setup
│   ├── server.ts               # Server initialization
│   ├── controllers             # Contains controllers for handling requests
│   │   └── auth.controller.ts  # Authentication controller
│   ├── routes                  # Defines application routes
│   │   └── auth.routes.ts      # Authentication routes
│   ├── models                  # Data models
│   │   └── user.model.ts       # User model
│   ├── services                # Business logic
│   │   └── auth.service.ts     # Authentication service
│   ├── repositories            # Database operations
│   │   └── user.repository.ts   # User repository
│   ├── middleware              # Middleware functions
│   │   └── auth.middleware.ts   # Authentication middleware
│   ├── utils                   # Utility functions
│   │   └── hash.util.ts        # Password hashing utilities
│   ├── config                  # Configuration settings
│   │   └── index.ts            # Application configuration
│   ├── db                      # Database client setup
│   │   └── client.ts           # Database client
│   └── types                   # Type definitions
│       └── index.d.ts          # TypeScript types and interfaces
├── tests                       # Unit tests
│   └── auth.test.ts           # Tests for authentication functionality
├── prisma                      # Prisma schema
│   └── schema.prisma           # Database schema
├── .env.example                # Example environment variables
├── package.json                # NPM configuration
├── tsconfig.json              # TypeScript configuration
├── jest.config.js             # Jest configuration
├── Dockerfile                  # Docker image instructions
├── docker-compose.yml          # Docker Compose configuration
└── README.md                   # Project documentation
```

## Getting Started

1. Clone the repository:
   ```
   git clone <repository-url>
   cd user-account-service
   ```

2. Install dependencies:
   ```
   npm install
   ```

3. Set up the environment variables:
   - Copy `.env.example` to `.env` and fill in the required values.

4. Run the application:
   ```
   npm start
   ```

5. Run tests:
   ```
   npm test
   ```

## License

This project is licensed under the MIT License.