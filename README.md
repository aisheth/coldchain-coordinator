# Welcome to your Lovable project

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Open your project in the [Lovable editor](https://lovable.dev) and keep building.

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: connect the project to GitHub and every change made in Lovable is committed straight to your repository.
- **Full ownership**: this code is yours. Push to your repository and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```

## Live API configuration

The app connects to `https://cold-chain-clin.onrender.com` by default. Set the public `VITE_API_BASE_URL` environment variable to use another FastAPI origin; resource paths are appended under `/api/v1`. See `.env.example`.

Sign in with an account created in that backend. Access and refresh tokens are kept in tab-scoped browser session storage. Never add database credentials, `SECRET_KEY`, or other private values to `VITE_*` variables.

## Built with

- TanStack Start
- TypeScript
- React
- Tailwind CSS
