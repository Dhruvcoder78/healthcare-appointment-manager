# Healthcare Appointment & Follow-up Manager

## Tech Stack
- Backend: Node.js, Express.js, Prisma ORM, PostgreSQL
- Frontend: React (Vite), Tailwind CSS
- Auth: JWT with Role-Based Access Control (ADMIN, DOCTOR, PATIENT)
- AI: OpenAI API (or compatible LLM) for clinical summaries
- Notifications: Nodemailer (SMTP), node-cron for background jobs
- Calendar: Google Calendar API (OAuth 2.0)

## System Guidelines & Requirements
- Prevent double-booking on simultaneous attempts using database transactions/locking.
- Pre-visit summary prompt: "Analyse these symptoms and return: urgency level (Low / Medium / High), chief complaint, and three suggested questions for the doctor. Symptoms: <symptoms>"
- Post-visit summary prompt: "Convert these clinical notes into a patient-friendly summary with medication schedule and follow-up steps: <notes>"
- Background jobs: Periodically check medication reminder intervals and retry failed email deliveries.
- Handle LLM failures gracefully (fallback data, no crashes).