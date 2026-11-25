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

## CSV imports and local drafts

Owner/admin master-data pages link to `/imports`. Download the template for the chosen area, review row errors and duplicates, and explicitly confirm before saving. Reference import order is categories/size options/UOMs, items, then variants. Importing worker accounts is conservatively owner-only and always creates `role=worker`; temporary passwords are entered separately, never in CSV files or reports. All writes use existing single-record API endpoints, with partial results retained on-screen and downloadable. Rechecking retries only eligible failed/invalid rows, never saved rows. Network/server errors with unknown write outcomes are excluded from automatic retries and require checking saved records first. No projects or transactions are bulk imported.

Unsaved non-secret form fields are written synchronously to browser-local storage under organization/user/form/entity keys. Returning to a form offers Resume/Discard; successful saves clear the corresponding draft. Drafts are local to this browser/device, not shared across devices, and excluded from sign-in/password-change forms. Photos and temporary account passwords must be reselected/reentered. Local draft discard never deletes server records. A partially created procurement request is checkpointed in its draft and resubmission blocked, because this frontend cannot safely infer whether each non-idempotent stage completed.

## Worker account management

Owner/admin Users management can edit a worker's name, email, phone and active status through `PATCH /users/{user_id}`. Inactive workers are excluded from new assignment choices; existing assignments and history are not changed. Password reset is a separate confirmed `POST /users/{user_id}/reset-password` action. Its temporary password is held only in the open dialog's React state, never written to drafts, browser storage or application logs, and is cleared when the dialog closes. Workers cannot call these management actions from the app and retain only their own task/profile experience.

The backend's `must_change_password` account flag gates the entire app behind the self-service password-change form. A successful `/auth/change-password` response returns replacement access and refresh tokens; the client saves both immediately so it does not continue with revoked credentials. Resetting another user's password never retrieves their old password or switches the owner into that user's account.

## Built with

- TanStack Start
- TypeScript
- React
- Tailwind CSS
