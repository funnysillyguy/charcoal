// Terms of Service and Privacy Policy. Plain language, and only claims that match how the app
// actually works (see cloud.js, sync.js, counts.js, social.js and supabase/functions/ai).
import { Modal } from './ui.jsx';

const UPDATED = 'October 25, 2026';
const ISSUES = 'https://github.com/funnysillyguy/charcoal/issues';

function Terms() {
  return (
    <>
      <p className="legal-date">Last updated {UPDATED}</p>
      <p>
        Charcoal is an independent hobby project run by its owner (<b>@own</b> on Charcoal). It isn’t affiliated with
        Character.AI, DeepSeek or any other company. By using Charcoal you agree to these terms. If you don’t agree, don’t
        use it.
      </p>

      <h2>Who can use it</h2>
      <p>
        You must be at least 13. If you’re under 18, you need a parent or guardian’s permission. If the law where you live
        sets a higher minimum age for services like this, that age applies.
      </p>

      <h2>The characters are AI</h2>
      <p>
        Replies are written by an AI model, not by real people. They can be wrong, strange or offensive, and nothing a
        character says is advice of any kind: not medical, legal, financial or anything else. Treat everything as
        fiction. If you’re in crisis, contact local emergency services or a crisis line, not a character.
      </p>

      <h2>Your account and content</h2>
      <ul>
        <li>Keep your password and recovery codes safe. We can’t recover an account without them.</li>
        <li>
          You own the characters and personas you make. You let Charcoal store them and show them to you so the service
          works. They’re private to your account.
        </li>
        <li>Only upload images and text you have the right to use.</li>
      </ul>

      <h2>Don’t use Charcoal to</h2>
      <ul>
        <li>make or share anything sexual involving minors, or anything illegal where you live;</li>
        <li>harass, threaten or target real people, or pass off AI text as a real person’s words;</li>
        <li>
          abuse the built-in AI: scripts, bots, shared or resold accounts, or making many accounts to get around the daily
          limit;
        </li>
        <li>attack the site, other users, or the code sandbox, or use Charcoal Chat’s web access to reach private systems.</li>
      </ul>

      <h2>The built-in AI</h2>
      <p>
        The built-in AI is free, comes with a daily limit, and is paid for by the owner. Replies that contain code count
        three times toward that limit and toward the reply break. It can be changed, limited or switched off at any time. If you add your own DeepSeek key instead, you’re responsible for that account and
        anything it costs.
      </p>

      <h2>Canvas and the code runner</h2>
      <p>
        Pages and code a character writes run in a sandbox in your own browser. You decide what to run and what to download,
        and you’re responsible for what you do with it.
      </p>

      <h2>Ending things</h2>
      <p>
        You can delete your account any time from the account menu. Accounts that break these terms can be suspended or
        deleted.
      </p>

      <h2>No guarantees</h2>
      <p>
        Charcoal is provided as is, without warranties of any kind. It may go down, lose data or change. As far as the law
        allows, the owner isn’t liable for any damages from using it. Some places don’t allow these limits, so they may not
        all apply to you.
      </p>

      <h2>Changes</h2>
      <p>
        If these terms change, the date at the top changes too. Using Charcoal after that means you accept the new
        version.
      </p>

      <h2>Contact</h2>
      <p>
        Questions or problems: open an issue at{' '}
        <a href={ISSUES} target="_blank" rel="noreferrer">
          github.com/funnysillyguy/charcoal
        </a>
        .
      </p>
    </>
  );
}

function Privacy() {
  return (
    <>
      <p className="legal-date">Last updated {UPDATED}</p>
      <p>
        Short version: your chats stay on your device, we don’t sell anything, and there are no ads or tracking scripts.
        Here’s everything Charcoal stores and who else sees what.
      </p>

      <h2>Stored on your device only</h2>
      <ul>
        <li>Your chat history and the images you attach.</li>
        <li>Your settings, plus your DeepSeek key if you add one without an account.</li>
      </ul>
      <p>Clearing your browser’s site data or using “Delete history” in a chat removes them.</p>

      <h2>Stored on our server (only with an account)</h2>
      <ul>
        <li>
          <b>Your username and password.</b> Sign-in is handled by Supabase and passwords are stored hashed. There’s no
          email, so we never ask for one.
        </li>
        <li>
          <b>Recovery codes</b>, stored hashed, so you can reset your password.
        </li>
        <li>
          <b>Characters and personas you make</b>, so they sync across your devices. Only your account can read them.
        </li>
        <li>
          <b>Your DeepSeek key, if you save one.</b> It’s encrypted in your browser with your password before it’s uploaded,
          so we can’t read it.
        </li>
        <li>
          <b>Which characters you’ve started chatting with</b>, to show how many people have chatted with each one. Only
          the totals are public, never who.
        </li>
        <li>
          <b>How much of the built-in AI you used each day</b> (a token count, not your messages), to enforce the daily
          limit. Replies with code count three times.
        </li>
        <li>
          <b>How many web searches and page opens you ran each day</b> in Charcoal Chat (counts only, not what you
          searched), to enforce a daily limit.
        </li>
        <li>
          <b>Notifications</b>, like a thanks someone sent you. A thanks you send shows your username to the person who
          gets it.
        </li>
      </ul>

      <h2>When you use the built-in AI</h2>
      <p>
        To write a reply, the conversation (your messages, the character’s definition and any images you attached) passes
        through our server to DeepSeek. Our server doesn’t save the content. DeepSeek processes it under its own privacy
        policy, and its servers may be in China. If you use your own key, your browser talks to DeepSeek directly and our
        server isn’t involved.
      </p>

      <h2>Charcoal Chat</h2>
      <ul>
        <li>
          Its conversations are stored on your device, like your other chats.
        </li>
        <li>
          If you ask it about your other chats, it searches and reads them right here on your device and sends only the
          parts it needs to DeepSeek with your message. It doesn’t look unless you ask.
        </li>
        <li>Files you attach are stored on your device and sent to DeepSeek as part of your message.</li>
        <li>
          It can change things in Charcoal for you (settings, chats, characters, your persona, signing out or deleting your
          account), but only after you allow each action in a permission box. Account actions ask every time.
        </li>
        <li>
          With web search on, the searches and pages it looks up go through our server to Google News, Wikipedia and
          DuckDuckGo’s answer service (and Brave Search, if it’s enabled). Those services see the search, not who you are.
          We don’t store what you searched.
        </li>
      </ul>

      <h2>Other services Charcoal uses</h2>
      <ul>
        <li>
          <b>Supabase</b> hosts accounts and the database. Like most hosts, it keeps short-term request logs (such as IP
          address and time) for security and debugging.
        </li>
        <li>
          <b>GitHub Pages</b> serves the website, and <b>Google Fonts</b> serves its fonts. Both see your IP address when
          your browser loads them.
        </li>
        <li>
          <b>jsDelivr</b> provides the Python runtime, downloaded only when you press Run on Python code.
        </li>
      </ul>

      <h2>Deleting your data</h2>
      <p>
        Deleting your account (account menu, then Delete account) permanently removes your account, synced characters
        and personas, saved key, recovery codes, chat-start records, usage counts and your notifications. Thanks you
        already sent stay in the other person’s inbox. Chats on your device stay until you delete them there.
      </p>

      <h2>Kids</h2>
      <p>Charcoal isn’t for children under 13. If we learn an account belongs to someone under 13, we delete it.</p>

      <h2>Security</h2>
      <p>
        Database rows are locked to their owner, the code sandbox has no access to your account or the internet, and keys
        are encrypted before upload. No system is perfect, so use a password you don’t use anywhere else.
      </p>

      <h2>Changes and contact</h2>
      <p>
        If this policy changes, the date at the top changes too. Questions or deletion requests: open an issue at{' '}
        <a href={ISSUES} target="_blank" rel="noreferrer">
          github.com/funnysillyguy/charcoal
        </a>
        .
      </p>
    </>
  );
}

export default function LegalModal({ page, onChange, onClose }) {
  return (
    <Modal open={!!page} onClose={onClose} title={page === 'privacy' ? 'Privacy Policy' : 'Terms of Service'} size="lg">
      <div className="legal-tabs" role="tablist" aria-label="Legal">
        <button type="button" role="tab" aria-selected={page === 'terms'} className={`chip chip-btn ${page === 'terms' ? 'active' : ''}`} onClick={() => onChange('terms')}>
          Terms
        </button>
        <button type="button" role="tab" aria-selected={page === 'privacy'} className={`chip chip-btn ${page === 'privacy' ? 'active' : ''}`} onClick={() => onChange('privacy')}>
          Privacy
        </button>
      </div>
      <article className="legal">{page === 'privacy' ? <Privacy /> : <Terms />}</article>
    </Modal>
  );
}
