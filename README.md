# Charcoal

A dark-first AI character chat app (Character.ai-style) built with React + Vite. Real replies come from DeepSeek's OpenAI-compatible API, streamed token by token, with swipes, image input, a creation studio and "Help me write".

## Run it

```bash
npm install
cp .env.example .env.local   # optional: put VITE_DEEPSEEK_API_KEY here
npm run dev                  # http://localhost:5173
```

Or skip `.env` and paste your key in **Settings** (gear, top right). It's stored in this browser's localStorage and sent only to the base URL you set. **Test connection** calls `GET /models` (free) and confirms your model is listed.

Static build: `npm run build` → `dist/`, deployable to any static host (GitHub Pages, Netlify, Vercel). api.deepseek.com accepts browser requests (CORS), so no server is needed. Anyone who opens a deployed copy uses their own key.

## DeepSeek setup that matters

| Setting | Value | Why |
|---|---|---|
| Endpoint | `https://api.deepseek.com/v1/chat/completions` | OpenAI-compatible |
| Model | `deepseek-flash` | DeepSeek's ID for V4.1-Flash, the vision model. `deepseek-v4.1-flash` is an aggregator name and is not listed on api.deepseek.com. |
| `thinking` | `{ "type": "disabled" }` by default | Thinking is on by default at DeepSeek and ignores `temperature`, which would make swipe variation do nothing. Toggle it in Settings. |
| Creativity | `presence_penalty` / `frequency_penalty` + a prompt rule | `top_p` is fixed at 1.0 in non-thinking mode on Flash |
| `stream_options.include_usage` | `true` | Exact output-token counts feed the fuel gauge |

## How replies are built (`src/lib/prompt.js`)

- **System prompt**: identity + persona definition, current mood (per-chat override from the 🎭 button), your persona bio, strict in-character rules (never breaks character, no AI/assistant talk, no disclaimers, `*asterisks*` for actions, never writes for `{{user}}`), length rule from Verbosity, creativity rule, image rule, and the example dialogue.
- **History**: greeting as the first assistant turn, then alternating turns (active swipe only), same-role turns merged, oldest turns dropped past a ~60k-character budget.
- **Images**: user turns become `[{type:"text"}, {type:"image_url", image_url:{url:"data:image/...;base64,..."}}]`. PNG/JPEG/WebP, up to 4 per message, attach / paste / drag-and-drop; anything over 2048px or 3 MB is downscaled first. Only the 3 most recent image turns resend pixels; older ones become a text note.

## Swipes

- Every message you send fires **3 drafts in parallel** (Settings → Replies per message, 1–3). Draft 1 uses the character's temperature; the others use a random 0.85–1.0 and a "different angle" nudge.
- Regenerate (or `>` past the last draft) adds **one** draft at 0.85–1.0, told to avoid wording from the earlier drafts.
- Capped at **40** responses per message. Stop cancels every draft in flight.

## Fuel tank (`src/lib/fuel.js`)

2,000,000 output tokens. Every draft drains it (DeepSeek's exact counts when reported, ~4 chars/token otherwise). At empty, chat pauses for a 60-second refuel animation, then the tank is full. Survives reloads mid-refuel.

## Help me write (`src/lib/assist.js`)

- **Chat**: pencil button beside the message box. Empty box → 3 ideas for your next message. Draft typed → 3 rewrites of it. Tap one to drop it in.
- **Studio**: describe the character and optionally attach a reference image; returns name options, tagline, description, greeting, persona, example lines, tags, mood, category (DeepSeek JSON mode + vision). "Use as avatar" keeps the image.

## Characters

16 original seed characters (6 furry, with procedurally drawn portraits from `src/components/Portrait.jsx`; the generator covers thousands of looks). **Import card** in the studio reads Tavern/SillyTavern V1/V2/V3 cards (`.json` or `.png` with embedded data) and carries over the creator name and source link so the original maker is credited. Imported cards default to Private.

## Without a key

The app runs on an offline demo engine that remixes each character's example dialogue, so everything stays clickable. The hosted claude.ai preview uses Claude through the viewer instead, because claude.ai blocks hosted pages from calling other sites.

## Layout

```
src/
  App.jsx                      shell, navigation, modals
  data/characters.js           seed personas
  lib/
    deepseek.js                SSE streaming client, /models, JSON mode, error mapping
    prompt.js                  system prompt + history + sampling params
    generate.js                picks DeepSeek / Claude-in-viewer / demo
    useChatEngine.js           send, parallel drafts, swipe, regenerate, retry, stop
    store.jsx                  state (IndexedDB), settings (localStorage), selectors
    assist.js  cards.js  fuel.js  images.js  portraits.js  markdown.jsx  hostAI.js
  components/
    Layout/Navbar.jsx  Layout/Sidebar.jsx
    CharacterCard.jsx  CharacterGrid.jsx  CategoryTabs.jsx  FeaturedCarousel.jsx
    Chat/ChatWindow.jsx  Chat/ChatMessage.jsx  Chat/ChatInput.jsx  Chat/SwipeController.jsx
    Chat/PersonaPicker.jsx  Chat/ExportModal.jsx
    CharacterProfileModal.jsx  SettingsModal.jsx  Fuel.jsx  Portrait.jsx  Avatar.jsx
  pages/Home.jsx  pages/CharacterCreator.jsx
```

Testing against a mock server: set `DEEPSEEK_PROXY_TARGET=http://localhost:8787` and the base URL to `/deepseek/v1` to route through the Vite proxy.

## Accounts and sync

Sign in from the sidebar. Usernames and passwords only, no email. Signup shows 8 one-time recovery codes; only their hashes are stored.

- Characters and personas sync across devices (last edit wins). Chats stay on each device.
- Your DeepSeek key is encrypted in the browser (AES-GCM, key derived from your password with PBKDF2) before upload. The server only stores ciphertext. A password reset with a recovery code clears it, so you paste the key in once more.
- Backend: Supabase (Postgres with row-level security) plus one edge function, `account`, for signup, recovery-code resets, new codes, and account deletion.
