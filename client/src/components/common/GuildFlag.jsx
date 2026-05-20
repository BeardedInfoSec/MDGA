import { guildFlag, guildFlagVariant } from '../../utils/guildFlag';
import styles from './GuildFlag.module.css';

// Small character-level federation flag. Takes whatever shape the caller
// has — many endpoints surface guild_id + guild_faction on a character row,
// the leaderboard top-entry uses the same fields, and forum author rows
// use main_guild_id + main_guild_faction. The accessor prop lets each
// caller point at the right keys without us guessing.

export default function GuildFlag({ row, guildId, faction, accessor = 'guild', title }) {
  let gid = guildId;
  let fac = faction;
  if (row && gid == null) {
    if (accessor === 'main') {
      gid = row.main_guild_id;
      fac = row.main_guild_faction;
    } else {
      gid = row.guild_id;
      fac = row.guild_faction;
    }
  }
  const label = guildFlag(gid, fac);
  if (!label) return null;
  const variant = guildFlagVariant(fac);
  const cls = `${styles.flag} ${variant ? styles[`flag--${variant}`] : ''}`;
  return (
    <span className={cls} title={title || (label === 'MEGA' ? 'MEGA (Alliance federation)' : `MDGA ${label === 'MDGA' ? 'federation' : `flagship #${label}`}`)}>
      {label}
    </span>
  );
}
