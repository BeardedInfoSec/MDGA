import { Link } from 'react-router-dom';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import PageHero from '../../components/common/PageHero';
import styles from './Story.module.css';

const TIMELINE = [
  {
    date: 'Late 2024',
    title: 'The Return to Durotar',
    text: 'GM Cawkadoodle returned to World of Warcraft after a break, excited to revisit Durotar \u2014 once a vibrant hub for dueling and hanging out while waiting for queues. But something was wrong. Durotar was empty. The Horde was gone.',
  },
  {
    date: 'Late 2024',
    title: 'The Alliance Occupation',
    text: 'Cawkadoodle discovered that Durotar was being occupied and camped by an Alliance guild called <The Playas Club>. One night, TPC showed up and camped him at the graveyard for 5 hours straight \u2014 over 300 deaths. For hours, the little Blood DK kept respawning with rez sickness, getting farmed over and over.',
    image: '/images/image4.png',
    imageAlt: 'Alliance forces occupying Durotar',
  },
  {
    date: 'January 2025',
    title: 'A Hunter Named Druzak',
    text: 'The next day, Cawkadoodle met a hunter named Druzak \u2014 the only other person in all of Durotar actually trying to fight back. Druzak was in a guild called <Laughing Coffins>, and Cawkadoodle asked for an invite. He was accepted.',
  },
  {
    date: 'January 2025',
    title: 'Rallying the Horde',
    text: "When <Laughing Coffins> lost interest in fighting for Durotar, Cawkadoodle asked for invite permissions and began recruiting. He brought in 100+ Tichondrius players who shared one goal: taking Durotar back. But the Moonguard-based guild didn't share the same fire \u2014 the sensitive Moonguardians started complaining about anyone asking for help in Durotar.",
  },
  {
    date: 'January 1, 2025',
    title: 'MDGA Is Born',
    text: 'Cawkadoodle whispered Druzak: "Want to start a guild?" Next thing you know, <Make Durotar Great Again> was created. Almost all the original Tichondrius recruits followed them. The flag was planted. The war had begun.',
    image: '/images/Screenshot_2025-05-27_214251.png',
    imageAlt: 'Early MDGA guild photo',
  },
  {
    date: 'February 2025',
    title: 'Outnumbered 3 to 1',
    text: "The first month wasn't easy. The Alliance and <The Playas Club> still outnumbered MDGA 3 to 1, and the guild lost almost every major fight. But Cawkadoodle and Druzak didn't retreat \u2014 they built.",
  },
  {
    date: 'Spring 2025',
    title: 'Building the War Machine',
    text: "Processes were added that would shape MDGA into the machine it is today: Discord became a requirement, strengthening the community and weeding out casual players. A ranking system, weekly events, and activity requirements were established. This wasn't a casual guild anymore.",
  },
  {
    date: 'Spring 2025',
    title: 'The Playas Club Falls',
    text: 'A month or two later, <The Playas Club> lost over half their player base and became a dead guild with the same 10 people. Meanwhile, Durotar went from absolutely zero people to being packed full of PvPers enjoying the nostalgia of chilling in Durotar, hanging out, and meeting new friends.',
    image: '/images/3.png',
    imageAlt: 'Victory screen after defeating The Playas Club',
  },
  {
    date: 'Mid 2025',
    title: 'Expansion Across Shards',
    text: "With Tichondrius secured, MDGA expanded onto other Durotar shards \u2014 protecting Area 52, Illidan, and Zul'jin as well, making those servers vibrant with PvP activity too.",
    image: '/images/image2.png',
    imageAlt: 'MDGA expanding to new servers',
  },
  {
    date: '2025',
    title: 'The Battle of Tichondrius',
    text: "New enemies formed, like Ruthless Renegades, who overwhelmed MDGA with numbers in the early months. But that only helped \u2014 recruitment tripled. The turning point came in a massive 100+ vs 100+ battle in Durotar that resulted in MDGA victory, even temporarily crashing the Tichondrius server.",
    image: '/images/image1.png',
    imageAlt: 'The massive 100v100 battle in Durotar',
  },
  {
    date: '2025 \u2014 Present',
    title: 'The Throne Claimed',
    text: 'MDGA established itself as one of the most active guilds in North America and has quickly risen to be #1 in total PvP rating. From a New Year\'s Day dream to the top of the continent. The story continues.',
    image: '/images/highest_shuff_ratig.png',
    imageAlt: 'Solo Arena 3102 Rating - #1 in NA',
  },
];

export default function Story() {
  useDocumentTitle('Our Story | MDGA');

  return (
    <>
      <PageHero title="Our Story" subtitle="From a handful of warriors to the #1 PvP guild in North America" />

      <section className="section section--darker">
        <div className="container container--narrow">
          <p className={styles.intro}>
            Every great guild has an origin story. Ours began in the red dust of
            Durotar, where a lone Blood Death Knight dared to fight back against
            impossible odds and build something that would shake the foundations
            of Azeroth.
          </p>
        </div>
      </section>

      <section className="section section--dark">
        <div className="container">
          <div className={styles.timeline}>
            {TIMELINE.map((entry, i) => (
              <div key={i} className={styles.item}>
                <div className={styles.node} />
                <span className={styles.date}>{entry.date}</span>
                <h3 className={styles.title}>{entry.title}</h3>
                <p className={styles.text}>{entry.text}</p>
                {entry.image && (
                  <div className={styles.image}>
                    <img src={entry.image} alt={entry.imageAlt} />
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="section section--darker">
        <div className="container container--narrow text-center">
          <h2 className="section-title">The Story Continues</h2>
          <p className={styles.closing}>
            There's a lot more to our story, and it's still being written every day.
            Durotar belongs to the Horde, and MDGA is here to make sure it stays that way.
          </p>
          <div className="mt-8">
            <Link to="/join" className="btn btn--primary btn--lg">Join the Warband</Link>
          </div>
        </div>
      </section>
    </>
  );
}
