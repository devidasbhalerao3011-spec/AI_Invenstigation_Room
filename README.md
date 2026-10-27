# Investigation Room

Evidence-grounded, human-reviewed investigation workspace. This MVP includes a React command center and an Express API with case-scoped authorization, evidence integrity records, audit events, and a provider-neutral AI analysis contract.

## Run locally

1. Copy `.env.example` to `.env` and set values as needed.
2. Run `npm install`.
3. Run `npm run dev`.
4. Open `http://localhost:5173`.

The initial API uses in-memory demo data. Replace the repository layer with MongoDB and private object storage before any real-world use. AI analysis defaults to a safe local demo response; external processing must be deliberately enabled and configured server-side.
