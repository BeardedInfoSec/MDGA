import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams, useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import PageHero from '../../components/common/PageHero';
import styles from './Join.module.css';

const DISCORD_SVG = (
  <svg className={styles.discordIcon} viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
    <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.095 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.095 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" fill="currentColor"/>
  </svg>
);

function FaqItem({ question, answer, open, onToggle }) {
  return (
    <div className={`${styles.faqItem} ${open ? styles.faqItemOpen : ''}`}>
      <button className={styles.faqQuestion} onClick={onToggle} type="button">
        {question}
        <span className={styles.faqIcon}>+</span>
      </button>
      <div className={styles.faqAnswer}>
        <p>{answer}</p>
      </div>
    </div>
  );
}

export default function Join() {
  useDocumentTitle('Join Us | MDGA');
  const { isLoggedIn, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();

  const [pending, setPending] = useState(false);
  const [pendingEmail, setPendingEmail] = useState('');
  const [globalError, setGlobalError] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  const [openFaq, setOpenFaq] = useState(null);
  const [openRule, setOpenRule] = useState(0);

  const [characterName, setCharacterName] = useState('');
  const [server, setServer] = useState('');
  const [classSpec, setClassSpec] = useState('');
  const [experience, setExperience] = useState('');
  const [whyJoin, setWhyJoin] = useState('');
  const [realmList, setRealmList] = useState([]);

  useEffect(() => {
    const hashParams = new URLSearchParams(location.hash.replace(/^#/, ''));
    const code = hashParams.get('code') || searchParams.get('code');
    const status = searchParams.get('status');
    const error = searchParams.get('error');

    if (code) {
      fetch('/api/auth/discord/exchange', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
      })
        .then(async (res) => {
          if (!res.ok) throw new Error('Exchange failed');
          return res.json();
        })
        .then((data) => {
          if (!data.token || !data.user) throw new Error('Invalid auth payload');
          login(data.token, data.user);
          window.history.replaceState({}, '', '/join');
          navigate('/', { replace: true });
        })
        .catch(() => {
          setGlobalError('Session expired. Please try again.');
          window.history.replaceState({}, '', '/join');
        });
      return;
    }

    if (status === 'pending') {
      setPendingEmail(searchParams.get('email') || '');
      setPending(true);
      window.history.replaceState({}, '', '/join');
      return;
    }

    if (error) {
      let msg = 'Something went wrong. Please try again.';
      if (error === 'discord_denied') msg = 'Discord authorization was cancelled. Please try again.';
      if (error === 'invalid_state') msg = 'Session expired. Please try again.';
      if (error === 'discord_error') msg = 'Discord verification failed. Please try again.';
      if (error === 'suspended') msg = 'Your account has been suspended. Contact an officer if you believe this is an error.';
      if (error === 'banned') msg = 'Your account has been banned. If you believe this is a mistake, please contact an officer.';
      setGlobalError(msg);
      window.history.replaceState({}, '', '/join');
    }

    if (isLoggedIn) {
      navigate('/', { replace: true });
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    fetch('/api/config/realms')
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data.realms)) {
          setRealmList([...data.realms].sort((a, b) => a.localeCompare(b)));
        }
      })
      .catch(() => {});
  }, []);

  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = useCallback(async (e) => {
    e.preventDefault();
    setGlobalError('');

    const errors = {};
    if (!characterName.trim()) errors.characterName = true;
    if (!server) errors.server = true;
    if (!classSpec) errors.classSpec = true;

    if (Object.keys(errors).length) {
      setFieldErrors(errors);
      return;
    }
    setFieldErrors({});
    setSubmitting(true);

    try {
      // Submit application to server first so character/realm data is available
      // during the Discord OAuth callback
      const res = await fetch('/api/applications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          characterName: characterName.trim(),
          server,
          classSpec,
          discord: 'pending_verification',
          experience: experience.trim(),
          whyJoin: whyJoin.trim(),
        }),
      });
      const data = await res.json();
      // Pass appId so the Discord callback can link character/realm to the user
      window.location.href = `/api/auth/discord?from=join&appId=${data.id}`;
    } catch {
      setSubmitting(false);
      setGlobalError('Failed to submit application. Please try again.');
    }
  }, [characterName, server, classSpec, experience, whyJoin]);

  const rules = [
    { q: 'No Drama / Rage Baiting', a: 'No drama or rage baiting guildies on Discord or in-game.' },
    { q: 'Respectful Behavior', a: 'No blatant racism or sexism. Jokes are fine, but know your limits.' },
    { q: 'Keep Arguments Private', a: "I don't want to see your arguments in our chats. Take it to DMs and handle it like adults." },
    { q: 'Help in World PvP', a: 'When guildies are being attacked in a World PvP environment and you see it, if you are not busy or AFK, help them.' },
    { q: 'Toughen Up', a: "This guild is not for the soft. If you can't handle the internet, you probably can't handle here. If you have a genuine issue, feel free to reach out to an officer or myself and we can think of ways to resolve or approach such issue." },
    { q: 'Match Your Name', a: "Your name in our server should match your main's name in the guild. In order to keep an accurate reflection of activity and a true reflection of our numbers, this data is vital. You must also take the time to label your alts, if not, they risk being kicked." },
    { q: 'Have Fun', a: "Lastly, remember that this is a game, and the goal is to have fun. Everyone here is 18+. I don't believe in 1000 rules. Behave and don't be a dumbass." },
  ];

  const faqs = [
    { q: 'What are the activity requirements?', a: 'MDGA 1 is reserved for our most active combatants. Members are expected to be consistently active. Frequent long-term absences or "once-in-a-while" logins will result in a transfer to our secondary divisions (MDGA 2, 3, etc.). If you are moved due to inactivity, you are welcome to rejoin the core roster once your availability stabilizes. We prioritize main characters in the core guild and allow very active alts. All other alts can join MDGA 2/3/etc. If you decide to swap your primary class, you must submit an official Main Change request on Discord.' },
    { q: 'Do I need to be on Tichondrius?', a: 'Not at all! We welcome players from all US realms. However, Tichondrius remains our home base\u2014you\'ll usually find us hanging out and dueling in front of Orgrimmar in Durotar.' },
    { q: 'Is there a level or gear requirement?', a: 'We accept players of all skill levels. MDGA actively helps members gear up through Battlegrounds, Coaching, and organized PvP events. To us, your attitude and activity are far more important than your current PvP rank.' },
    { q: 'What happens if I go inactive?', a: 'Inactive members are removed without notice after 2 to 4 weeks, depending on their guild rank. If you need a break for IRL reasons, simply post in "AFK-Notice" in Discord to secure your spot for a short-term absence.' },
    { q: 'What classes/specs are you looking for?', a: 'We accept all classes and specs. MDGA values players who show up, participate, and fight for the Horde. Play what you enjoy and we\'ll find a role for you in the warband.' },
  ];

  return (
    <>
      <PageHero title="Join the Warband" subtitle="Think you have what it takes to fight for Durotar?" />

      <section className="section section--darker">
        <div className="container">
          <h2 className="section-title">How to Join</h2>
          <div className="grid grid--3">
            {[
              { icon: '1', title: 'Join Discord', desc: 'Discord is required. Join our server to get started:', link: true },
              { icon: '2', title: 'Find Us In-Game', desc: 'Use Guild Finder and type MDGA to pull up all our guilds, or post in guild-invite-request on our Discord.' },
              { icon: '3', title: 'Verify Yourself', desc: "Type your Main's name and Server in the Verification Channel on Discord." },
            ].map((step) => (
              <div key={step.icon} className={`card ${styles.requirementCard}`}>
                <span className={styles.requirementCardIcon} aria-hidden="true">{step.icon}</span>
                <h3>{step.title}</h3>
                <p>{step.desc}</p>
                {step.link && (
                  <a href="https://discord.gg/wowmdga" target="_blank" rel="noopener noreferrer" className={`btn btn--gold ${styles.stepLinkBtn}`}>
                    discord.gg/wowmdga
                  </a>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="section section--dark">
        <div className="container">
          <h2 className="section-title">Requirements</h2>
          <div className="grid grid--2">
            {[
              { icon: '\u{1F4AC}', title: 'Discord Required', desc: 'All members must be active in our Discord server. This is how we coordinate, communicate, and build community.' },
              { icon: '\u2694', title: 'Stay Active', desc: 'Minimum activity requirements apply. Log in regularly, attend events, and participate. Inactives will be removed.' },
            ].map((req) => (
              <div key={req.title} className={`card ${styles.requirementCard}`}>
                <span className={styles.requirementCardIcon} aria-hidden="true">{req.icon}</span>
                <h3>{req.title}</h3>
                <p>{req.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="section section--dark">
        <div className="container container--narrow">
          <h2 className="section-title">Guild Rules</h2>
          <div className={styles.faq}>
            {rules.map((rule, i) => (
              <FaqItem
                key={i}
                question={rule.q}
                answer={rule.a}
                open={openRule === i}
                onToggle={() => setOpenRule(openRule === i ? null : i)}
              />
            ))}
          </div>
        </div>
      </section>

      <section className="section section--dark">
        <div className="container container--narrow">
          <h2 className="section-title">Apply to Join</h2>

          {pending ? (
            <div className={styles.pendingBox}>
              <div className={styles.pendingInfo}>
                Whoops! Looks like you are not a member of our Discord just yet.
                Don't worry, we have let our officers know and they will review your
                request shortly! Keep an eye on your email
                {pendingEmail ? <> at <strong>{pendingEmail}</strong></> : ''} for
                an invitation code!
              </div>
              <p className={styles.pendingText}>
                In the meantime, you can join our Discord server directly:
              </p>
              <a href="https://discord.gg/wowmdga" target="_blank" rel="noopener noreferrer" className="btn btn--discord btn--lg btn--full">
                {DISCORD_SVG}
                Join MDGA Discord
              </a>
            </div>
          ) : (
            <form className={styles.applicationForm} onSubmit={handleSubmit} noValidate>
              <h3 className={styles.sectionLabel}>Character Info</h3>

              <div className={`${styles.formGroup} ${fieldErrors.characterName ? styles.formGroupError : ''}`}>
                <label className={styles.formLabel} htmlFor="character-name">Character Name</label>
                <input
                  className={styles.formInput}
                  type="text"
                  id="character-name"
                  placeholder="Your main character's name"
                  value={characterName}
                  onChange={(e) => setCharacterName(e.target.value)}
                  required
                />
                <span className={styles.formError}>Character name is required</span>
              </div>

              <div className={`${styles.formGroup} ${fieldErrors.server ? styles.formGroupError : ''}`}>
                <label className={styles.formLabel} htmlFor="server">Server</label>
                <select
                  className={styles.formSelect}
                  id="server"
                  value={server}
                  onChange={(e) => setServer(e.target.value)}
                  required
                >
                  <option value="">Select your server</option>
                  {realmList.map((realm) => (
                    <option key={realm} value={realm}>{realm}</option>
                  ))}
                </select>
                <span className={styles.formError}>Please select a server</span>
              </div>

              <div className={`${styles.formGroup} ${fieldErrors.classSpec ? styles.formGroupError : ''}`}>
                <label className={styles.formLabel} htmlFor="class-spec">Class &amp; Spec</label>
                <select
                  className={styles.formSelect}
                  id="class-spec"
                  value={classSpec}
                  onChange={(e) => setClassSpec(e.target.value)}
                  required
                >
                  <option value="">Select your class &amp; spec</option>
                  <optgroup label="Death Knight">
                    <option value="Blood Death Knight">Blood</option>
                    <option value="Frost Death Knight">Frost</option>
                    <option value="Unholy Death Knight">Unholy</option>
                  </optgroup>
                  <optgroup label="Demon Hunter">
                    <option value="Devourer Demon Hunter">Devourer</option>
                    <option value="Havoc Demon Hunter">Havoc</option>
                    <option value="Vengeance Demon Hunter">Vengeance</option>
                  </optgroup>
                  <optgroup label="Druid">
                    <option value="Balance Druid">Balance</option>
                    <option value="Feral Druid">Feral</option>
                    <option value="Guardian Druid">Guardian</option>
                    <option value="Restoration Druid">Restoration</option>
                  </optgroup>
                  <optgroup label="Evoker">
                    <option value="Augmentation Evoker">Augmentation</option>
                    <option value="Devastation Evoker">Devastation</option>
                    <option value="Preservation Evoker">Preservation</option>
                  </optgroup>
                  <optgroup label="Hunter">
                    <option value="Beast Mastery Hunter">Beast Mastery</option>
                    <option value="Marksmanship Hunter">Marksmanship</option>
                    <option value="Survival Hunter">Survival</option>
                  </optgroup>
                  <optgroup label="Mage">
                    <option value="Arcane Mage">Arcane</option>
                    <option value="Fire Mage">Fire</option>
                    <option value="Frost Mage">Frost</option>
                  </optgroup>
                  <optgroup label="Monk">
                    <option value="Brewmaster Monk">Brewmaster</option>
                    <option value="Mistweaver Monk">Mistweaver</option>
                    <option value="Windwalker Monk">Windwalker</option>
                  </optgroup>
                  <optgroup label="Paladin">
                    <option value="Holy Paladin">Holy</option>
                    <option value="Protection Paladin">Protection</option>
                    <option value="Retribution Paladin">Retribution</option>
                  </optgroup>
                  <optgroup label="Priest">
                    <option value="Discipline Priest">Discipline</option>
                    <option value="Holy Priest">Holy</option>
                    <option value="Shadow Priest">Shadow</option>
                  </optgroup>
                  <optgroup label="Rogue">
                    <option value="Assassination Rogue">Assassination</option>
                    <option value="Outlaw Rogue">Outlaw</option>
                    <option value="Subtlety Rogue">Subtlety</option>
                  </optgroup>
                  <optgroup label="Shaman">
                    <option value="Elemental Shaman">Elemental</option>
                    <option value="Enhancement Shaman">Enhancement</option>
                    <option value="Restoration Shaman">Restoration</option>
                  </optgroup>
                  <optgroup label="Warlock">
                    <option value="Affliction Warlock">Affliction</option>
                    <option value="Demonology Warlock">Demonology</option>
                    <option value="Destruction Warlock">Destruction</option>
                  </optgroup>
                  <optgroup label="Warrior">
                    <option value="Arms Warrior">Arms</option>
                    <option value="Fury Warrior">Fury</option>
                    <option value="Protection Warrior">Protection</option>
                  </optgroup>
                </select>
                <span className={styles.formError}>Class &amp; Spec is required</span>
              </div>

              <hr className={styles.sectionDivider} />
              <h3 className={styles.sectionLabel}>About You</h3>

              <div className={styles.formGroup}>
                <label className={styles.formLabel} htmlFor="experience">PvP Experience</label>
                <textarea
                  className={styles.formTextarea}
                  id="experience"
                  rows="4"
                  placeholder="Tell us about your PvP experience..."
                  value={experience}
                  onChange={(e) => setExperience(e.target.value)}
                />
              </div>

              <div className={styles.formGroup}>
                <label className={styles.formLabel} htmlFor="why-join">Why MDGA?</label>
                <textarea
                  className={styles.formTextarea}
                  id="why-join"
                  rows="4"
                  placeholder="Why do you want to join Make Durotar Great Again?"
                  value={whyJoin}
                  onChange={(e) => setWhyJoin(e.target.value)}
                />
              </div>

              {globalError && <p className={styles.formErrorGlobal}>{globalError}</p>}

              <button type="submit" className="btn btn--discord btn--lg btn--full" disabled={submitting}>
                {DISCORD_SVG}
                {submitting ? 'Submitting...' : 'Join with Discord'}
              </button>
            </form>
          )}
        </div>
      </section>

      <section className="section section--darker">
        <div className="container container--narrow">
          <h2 className="section-title">Frequently Asked Questions</h2>
          <div className={styles.faq}>
            {faqs.map((faq, i) => (
              <FaqItem
                key={i}
                question={faq.q}
                answer={faq.a}
                open={openFaq === i}
                onToggle={() => setOpenFaq(openFaq === i ? null : i)}
              />
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
