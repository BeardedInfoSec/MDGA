export const BRACKET_LABELS = {
  solo_shuffle: 'Rating',
  arena_3v3: 'Rating',
  arena_2v2: 'Rating',
  rbg_rating: 'Rating',
  honorable_kills: 'Kills',
  killing_blows: 'KBs',
  arenas_played: 'Played',
  arenas_won: 'Wins',
  bgs_played: 'Played',
  bgs_won: 'Wins',
  mythic_plus_rating: 'Rating',
  highest_mplus_key: 'Key Level',
  item_level: 'iLvl',
  mythic_bosses_killed: 'Bosses',
  dungeons_entered: 'Runs',
  raids_entered: 'Runs',
  creatures_killed: 'Kills',
  total_deaths: 'Deaths',
  quests_completed: 'Quests',
  achievement_points: 'Points',
};

export const FORMAT_NUMBER = new Set([
  'honorable_kills', 'killing_blows', 'arenas_played', 'arenas_won',
  'bgs_played', 'bgs_won', 'total_deaths', 'creatures_killed',
  'dungeons_entered', 'raids_entered', 'quests_completed', 'achievement_points',
]);

export const SECTIONS = {
  pvp: {
    label: 'PvP',
    brackets: [
      { key: 'solo_shuffle', label: 'Solo Shuffle' },
      { key: 'arena_3v3', label: '3v3' },
      { key: 'arena_2v2', label: '2v2' },
      { key: 'rbg_rating', label: 'RBG' },
      { key: 'honorable_kills', label: 'HKs' },
      { key: 'killing_blows', label: 'KBs' },
      { key: 'arenas_played', label: 'Arenas' },
      { key: 'arenas_won', label: 'Arena Wins' },
      { key: 'bgs_played', label: 'BGs' },
      { key: 'bgs_won', label: 'BG Wins' },
    ],
  },
  pve: {
    label: 'PvE',
    brackets: [
      { key: 'dungeons_entered', label: 'Dungeons' },
      { key: 'raids_entered', label: 'Raids' },
      { key: 'creatures_killed', label: 'Mob Kills' },
    ],
  },
  general: {
    label: 'General',
    brackets: [
      { key: 'achievement_points', label: 'Achievements' },
      { key: 'quests_completed', label: 'Quests' },
      { key: 'total_deaths', label: 'Deaths' },
    ],
  },
};
