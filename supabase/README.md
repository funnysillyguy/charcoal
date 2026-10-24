# Charcoal backend (Supabase)

Project ref `pknqtfkdlpkhzyrysnft`. Edge functions here are deployed with `verify_jwt: false` because each one checks the caller itself.

- `functions/ai` is the built-in AI. Signed-in users chat on the owner's DeepSeek key, which is stored in `public.app_secrets` (RLS on, no policies, so only the service role can read it). Per-user and site-wide daily output-token caps are tracked in `public.shared_usage`.
- `account` handles username signup, recovery-code resets, new codes, and account deletion. Source is in the conversation history; redeploy from the dashboard if needed.
