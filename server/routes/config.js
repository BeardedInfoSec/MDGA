const express = require('express');
const router = express.Router();

// Full US realm list — used when ALLOWED_REALMS is not set
const US_REALMS = [
  'Tichondrius','Area 52','Illidan',"Zul'jin",'Stormrage','Sargeras',"Mal'Ganis",
  'Bleeding Hollow','Thrall','Proudmoore','Dalaran','Emerald Dream','Wyrmrest Accord',
  'Moon Guard',"Kel'Thuzad",'Arthas','Ragnaros','Azralon','Barthilas','Frostmourne',
  'Blackrock','Burning Legion','Hyjal','Korgath','Lightbringer','Aegwynn','Agamaggan',
  'Aggramar','Akama','Alexstrasza','Alleria','Altar of Storms','Alterac Mountains',
  "Aman'Thul",'Andorhal','Anetheron','Antonidas',"Anub'arak",'Anvilmar','Arathor',
  'Archimonde','Argent Dawn','Arygos','Auchindoun','Azgalor','Azjol-Nerub',
  'Azshara','Baelgun','Balnazzar','Black Dragonflight','Blackhand','Blackwater Raiders',
  'Blackwing Lair',"Blade's Edge",'Bladefist','Blood Furnace','Bloodhoof','Bloodscalp',
  'Bonechewer','Borean Tundra','Boulderfist','Bronze Dragonflight','Bronzebeard',
  'Burning Blade','Caelestrasz','Cairne','Cenarion Circle','Cenarius',"Cho'gall",
  'Chromaggus','Coilfang','Crushridge','Daggerspine','Dark Iron','Darkspear',
  'Darrowmere',"Dath'Remar",'Dawnbringer','Deathwing','Demon Soul','Dentarg',
  'Destromath','Dethecus','Detheroc','Doomhammer','Draenor','Dragonblight',
  'Dragonmaw',"Drak'Tharon","Drak'thul",'Draka','Drakkari','Dreadmaul','Drenden',
  'Dunemaul','Durotan','Duskwood','Earthen Ring','Echo Isles','Eitrigg',"Eldre'Thalas",
  'Elune','Eonar','Eredar','Executus','Exodar','Farstriders','Feathermoon',
  'Fenris','Firetree','Fizzcrank','Frostmane','Frostwolf','Galakrond','Gallywix',
  'Garithos','Garona','Garrosh','Ghostlands','Gilneas','Gnomeregan','Gorefiend',
  'Gorgonnash','Greymane','Grizzly Hills',"Gul'dan",'Gurubashi','Hakkar',
  'Hellscream','Hydraxis','Icecrown',"Jubei'Thos","Kael'thas",'Kalecgos',
  'Kargath','Khaz Modan',"Khaz'goroth","Kil'jaeden",'Kilrogg','Kirin Tor',
  'Laughing Skull','Lethon','Lightninghoof','Llane','Lothar','Madoran','Maelstrom',
  'Magtheridon','Maiev',"Mak'aru",'Malorne','Malygos','Mannoroth','Medivh',
  'Misha',"Mok'Nathal",'Moonrunner','Mugthol','Muradin','Nagrand','Nathrezim',
  'Nazgrel','Nazjatar',"Ner'zhul",'Nesingwary','Nordrassil','Norgannon',
  'Onyxia','Perenolde',"Quel'dorei","Quel'Thalas",'Ravencrest',
  'Ravenholdt','Rexxar','Rivendare','Runetotem','Saurfang','Scarlet Crusade',
  'Scilla',"Sen'jin",'Sentinels','Shadow Council','Shadowmoon','Shadowsong',
  'Shandris','Shattered Halls','Shattered Hand',"Shu'halo",'Silver Hand',
  'Silvermoon','Sisters of Elune','Skullcrusher','Skywall','Smolderthorn',
  'Spinebreaker','Spirestone','Staghelm','Steamwheedle Cartel','Stonemaul',
  'Stormreaver','Stormscale','Suramar','Tanaris','Terenas','Terokkar',
  'Thaurissan','The Forgotten Coast','The Scryers','The Underbog','The Venture Co',
  'Thorium Brotherhood','Thunderhorn','Thunderlord','Tol Barad','Tortheldrin',
  'Trollbane','Turalyon','Twisting Nether','Uldaman','Uldum','Undermine',
  'Ursin','Uther','Vashj',"Vek'nilash",'Velen','Warsong','Whisperwind',
  'Wildhammer','Windrunner','Winterhoof','Zangarmarsh','Zuluhed',
];

function getAllowedRealms() {
  const raw = process.env.ALLOWED_REALMS || '';
  const configured = raw.split(',').map((r) => r.trim()).filter(Boolean);
  return configured.length > 0 ? configured : US_REALMS;
}

// GET /api/config/realms — public
router.get('/realms', (req, res) => {
  res.json({ realms: getAllowedRealms() });
});

module.exports = router;
module.exports.getAllowedRealms = getAllowedRealms;
