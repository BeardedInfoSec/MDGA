import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import PageHero from '../../components/common/PageHero';
import styles from './Leadership.module.css';

export default function Leadership() {
  useDocumentTitle('Leadership | MDGA');

  return (
    <>
      <PageHero title="Leadership" subtitle="The commanders who forged MDGA into a war machine" />

      <section className="section section--dark">
        <div className="container">
          <div className={styles.leaderFeature}>
            <div className={styles.leaderImage}>
              <img src="/images/Screenshot_2026-02-06_at_8.22.19_PM.png" alt="GM Cawkadoodle and MDGA members" />
              <div className={styles.classBadgeDk}>Blood Death Knight</div>
            </div>
            <div className={styles.leaderInfo}>
              <span className={styles.rank}>Guild Master</span>
              <h2 className={styles.name}>Cawkadoodle</h2>
              <div className={`${styles.classLabel} ${styles.classColorDk}`}>
                &#9876; Blood Death Knight
              </div>
              <p className={styles.bio}>
                Co-founder of MDGA and its commanding presence on the battlefield.
                Cawkadoodle envisioned a guild where the Horde didn't just survive
                in Durotar &mdash; it dominated. As a Blood Death Knight, he leads from
                the front line, an unkillable wall of crimson steel that rallies
                the warband behind him.
              </p>
              <p className={styles.bio}>
                When he returned to the game and found Durotar empty and camped by the Alliance,
                he didn't run. He died 300 times in one night. Then he built an army. Under his
                leadership, MDGA grew from a handful of recruits into the #1 PvP force in North America.
              </p>
              <ul className={styles.achievements}>
                <li>Founded MDGA &mdash; January 1, 2025</li>
                <li>Organized the 100v100 Battle of Tichondrius</li>
                <li>Led the guild to #1 NA PvP rating</li>
                <li>Established the Discord command structure</li>
                <li>Survived 300 deaths in one night at the graveyard</li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      <section className="section section--darker">
        <div className="container">
          <div className={styles.leaderFeatureReversed}>
            <div className={styles.leaderImage}>
              <img src="/images/Screenshot_2026-02-06_at_8.28.02_PM.png" alt="Chieftain Druzak and MDGA forces" />
              <div className={styles.classBadgeHunter}>Hunter</div>
            </div>
            <div className={styles.leaderInfo}>
              <span className={styles.rank}>Chieftain</span>
              <h2 className={styles.name}>Druzak</h2>
              <div className={`${styles.classLabel} ${styles.classColorHunter}`}>
                &#127993; Hunter
              </div>
              <p className={styles.bio}>
                Co-founder and MDGA's Chieftain. Druzak's sharp tactical mind
                complements Cawkadoodle's front-line leadership. Where the GM
                holds the line, Druzak coordinates the flanks.
              </p>
              <p className={styles.bio}>
                Originally from &lt;Laughing Coffins&gt; on Moonguard, Druzak was the only
                person in Durotar fighting back when Cawkadoodle found him. Together they
                built the recruitment pipeline that fueled MDGA's explosive growth across
                multiple server shards, and his tactical planning was key to the guild's
                victories against numerically superior forces.
              </p>
              <ul className={styles.achievements}>
                <li>Co-founded MDGA alongside Cawkadoodle</li>
                <li>Recruited the founding members from Laughing Coffins</li>
                <li>Spearheaded expansion to Area 52, Illidan, Zul'jin</li>
                <li>Designed the guild ranking system</li>
                <li>Master tactician of Durotar defense operations</li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      <section className="section section--dark">
        <div className="container">
          <div className={styles.leaderFeature}>
            <div className={styles.leaderImage}>
              <img src="/images/nemy.png" alt="Warlord Nemy" />
              <div className={styles.classBadgePriest}>Discipline Priest</div>
            </div>
            <div className={styles.leaderInfo}>
              <span className={styles.rank}>Warlord</span>
              <h2 className={styles.name}>Nemy</h2>
              <div className={`${styles.classLabel} ${styles.classColorPriest}`}>
                &#9876; Discipline Priest
              </div>
              <p className={styles.subtitle}>The Architect of the War Council</p>
              <p className={styles.bio}>
                Warlord and the hidden architect of MDGA. Nemy is the bridge between the
                chaos of the battlefield and the precision of the high command. While the
                Chieftain plans the flanks and the GM holds the line, Nemy ensures the
                entire war machine never skips a beat.
              </p>
              <p className={styles.bio}>
                Originally a veteran of the elite &lt;Schism PvP&gt;, Nemy joined the fray
                during the legendary 100v100 Battle of Durotar. Seeing a spark of true Horde
                dominance, Nemy brought a level of technical sophistication that transformed
                MDGA from a street-fighting warband into a highly automated superpower. Whether
                weaving shields in the heat of a graveyard camp or masterminding the backend
                infrastructure that tracks every victory, Nemy is the digital and spiritual
                spine of the guild.
              </p>
              <ul className={styles.achievements}>
                <li>Joined the Front Line &mdash; February 10, 2025</li>
                <li>Rapid Ascension &mdash; Appointed to the War Council within 30 days</li>
                <li>The Tech Mastermind &mdash; Engineered the guild's automation, record-keeping, and backend logistics</li>
                <li>Field Commander &mdash; Frequently assumes command of Durotar's defense during high-stakes world PvP incursions</li>
                <li>Council Enforcer &mdash; Known for an eccentric approach to guild culture and morale</li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      <section className="section section--darker">
        <div className="container">
          <h2 className="section-title">Rank Structure</h2>
          <p className="section-subtitle">The hierarchy that turned a ragtag warband into a disciplined army</p>
          <div className="grid grid--4">
            {[
              { title: 'Guild Master', desc: 'Supreme command of all MDGA operations and final decision authority' },
              { title: 'Chieftain', desc: 'Co-leader rank, strategic command and tactical coordination' },
              { title: 'Warlord', desc: 'Senior officers, event leaders, and shard commanders' },
              { title: 'Grunt', desc: 'Active members in good standing \u2014 the backbone of the warband' },
            ].map((rank) => (
              <div key={rank.title} className={`card ${styles.rankCard}`}>
                <h3>{rank.title}</h3>
                <p>{rank.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="section section--darker">
        <div className="container">
          <h2 className="section-title">The Warband in Action</h2>
          <div className="grid grid--2">
            <div className={styles.imageFrame}>
              <img src="/images/Screenshot_2026-02-06_18-21-39.png" alt="MDGA forces gathered in Durotar at sunset" />
              <div className={styles.imageCaption}>Durotar defense formation</div>
            </div>
            <div className={styles.imageFrame}>
              <img src="/images/Screenshot_2026-02-06_18-22-48.png" alt="MDGA guild gathering" />
              <div className={styles.imageCaption}>The warband assembled</div>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
