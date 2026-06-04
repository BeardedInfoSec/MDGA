// Canonical Class → Specs map for current retail WoW. Used by:
//   - the Join apply form (forum #79 multi-spec checkboxes)
//   - the Profile character-edit UI (set main / off spec)
// Source of truth — both places import this rather than redefining.

export const CLASS_SPECS = {
  'Death Knight': ['Blood', 'Frost', 'Unholy'],
  'Demon Hunter': ['Devourer', 'Havoc', 'Vengeance'],
  'Druid': ['Balance', 'Feral', 'Guardian', 'Restoration'],
  'Evoker': ['Augmentation', 'Devastation', 'Preservation'],
  'Hunter': ['Beast Mastery', 'Marksmanship', 'Survival'],
  'Mage': ['Arcane', 'Fire', 'Frost'],
  'Monk': ['Brewmaster', 'Mistweaver', 'Windwalker'],
  'Paladin': ['Holy', 'Protection', 'Retribution'],
  'Priest': ['Discipline', 'Holy', 'Shadow'],
  'Rogue': ['Assassination', 'Outlaw', 'Subtlety'],
  'Shaman': ['Elemental', 'Enhancement', 'Restoration'],
  'Warlock': ['Affliction', 'Demonology', 'Destruction'],
  'Warrior': ['Arms', 'Fury', 'Protection'],
};

export function isValidSpecForClass(className, spec) {
  if (!className || !spec) return false;
  const list = CLASS_SPECS[className];
  return !!(list && list.includes(spec));
}
