/* All character content in one place. Fan tribute; facts follow the Naruto manga/anime and official databooks. */

export const PROFILE = [
  ['Clan', 'Uchiha'],
  ['Birthday', 'June 9'],
  ['Rank', 'ANBU Captain'],
  ['Akatsuki Ring', '朱 · Vermilion'],
];

export const RELICS = [
  {
    key: 'headband',
    name: 'Scratched Forehead Protector',
    jp: '額当て',
    text: 'A Konoha forehead protector with a single slash through the Leaf symbol — the mark of a rogue ninja who has severed ties with his village.',
    facts: [
      'Itachi kept wearing it throughout his time in Akatsuki.',
      'The slash hides a truth: he never stopped protecting the Leaf.',
      'Kisame, his partner, wore the scratched headband of the Hidden Mist.',
    ],
  },
  {
    key: 'ring',
    name: 'Akatsuki Ring · 朱',
    jp: '朱 — Vermilion',
    text: 'Every Akatsuki member bears a ring tied to the organisation\'s sealing ritual. Itachi\'s reads 朱 ("vermilion") and is worn on his right ring finger.',
    facts: [
      'The rings correspond to the fingers of the Gedō Statue used to seal tailed beasts.',
      'Kisame\'s ring reads 南 ("south").',
      'Members are paired in two-person cells — Itachi was paired with Kisame.',
    ],
  },
  {
    key: 'kunai',
    name: 'Kunai',
    jp: '苦無',
    text: 'The standard ninja tool: throwing knife, dagger and climbing spike in one. Itachi\'s kunai precision was so exact that Sasuke idolised it from childhood.',
    facts: [
      'Itachi once hit every target in a clearing — including one hidden in a blind spot — by deflecting kunai off each other.',
      'He later taught the same trick to Sasuke.',
    ],
  },
  {
    key: 'shuriken',
    name: 'Shuriken',
    jp: '手裏剣',
    text: 'A four-pointed throwing star. In Itachi\'s hands every throw was a lesson in angles, timing and misdirection.',
    facts: [
      'Shuriken Jutsu is a core Academy discipline.',
      'Itachi graduated the Academy at the age of 7 as top of his class.',
    ],
  },
  {
    key: 'dango',
    name: 'Dango',
    jp: '団子',
    text: 'Sweet rice dumplings on a skewer. Itachi and Kisame are shown stopping at a dango shop, and Itachi\'s fondness for sweets is a favourite fan detail.',
    facts: [
      'The databook lists his favourite foods as onigiri with kelp and cabbage.',
      'A rare glimpse of an ordinary young man behind the legend.',
    ],
  },
  {
    key: 'cloud',
    name: 'Akatsuki Cloud',
    jp: '暁',
    text: 'The red cloud outlined in white, worn on the black cloaks of Akatsuki ("Dawn"). Itachi joined after leaving the Leaf — secretly to keep watch over the organisation.',
    facts: [
      'Akatsuki means "dawn" or "daybreak".',
      'His cloak also carried the high collar that hid half of his face in Part I.',
    ],
  },
];

export const TIMELINE = [
  { age: '4', title: 'A Child of War', jp: '戦', text: 'His father takes him to the aftermath of the Third Great Ninja War. The horror he sees makes him a pacifist for the rest of his life.' },
  { age: '7', title: 'Academy Graduate', jp: '卒業', text: 'Graduates top of his class at just seven years old — the prodigy the whole Uchiha clan is watching.' },
  { age: '8', title: 'Sharingan Awakens', jp: '写輪眼', text: 'Awakens the Sharingan, the Uchiha clan\'s kekkei genkai, which lets him read, predict and copy techniques.' },
  { age: '10', title: 'Chūnin', jp: '中忍', text: 'Promoted to chūnin at ten, and trusted with missions far beyond his years.' },
  { age: '11', title: 'ANBU', jp: '暗部', text: 'Joins Konoha\'s ANBU black ops and later becomes captain at 13 — while serving as the clan\'s spy on the village, and the village\'s spy on his clan.' },
  { age: '13', title: 'Shisui & the Mangekyō', jp: '万華鏡', text: 'His best friend Shisui Uchiha entrusts him with his eye and the village. Shisui\'s death awakens Itachi\'s Mangekyō Sharingan.' },
  { age: '13', title: 'The Night of Blood', jp: '一族殲滅', text: 'Ordered to stop the clan\'s coup, he wipes out the Uchiha — but cannot kill Sasuke. He leaves as a traitor, carrying the lie so his brother can live.' },
  { age: '18', title: 'Return to the Leaf', jp: '暁', text: 'Returns with Akatsuki partner Kisame, defeating Kakashi with Tsukuyomi — a quiet warning that he is still watching over the village.' },
  { age: '21', title: 'Brother vs Brother', jp: '兄弟', text: 'Ill and nearly blind, he faces Sasuke one last time, seals Orochimaru with the Totsuka Blade and dies with a final poke to Sasuke\'s forehead.' },
  { age: '∞', title: 'Edo Tensei & Izanami', jp: 'イザナミ', text: 'Reincarnated by Kabuto, he breaks free, fights beside Sasuke and ends the Reanimation Jutsu with Izanami — finally telling his brother the truth.' },
];

export const QUIZ = [
  { q: 'Which kanji is engraved on Itachi\'s Akatsuki ring?', a: ['朱 (Vermilion)', '南 (South)', '空 (Sky)', '青 (Blue)'], c: 0, e: 'Itachi\'s ring reads 朱 — "vermilion". 南 belongs to his partner Kisame.' },
  { q: 'Who was Itachi\'s partner in Akatsuki?', a: ['Deidara', 'Kisame Hoshigaki', 'Sasori', 'Hidan'], c: 1, e: 'Kisame Hoshigaki, the "Tailless Tailed Beast" from the Hidden Mist.' },
  { q: 'What is the name of the sword wielded by Itachi\'s Susanoo?', a: ['Kusanagi', 'Samehada', 'Totsuka Blade', 'Kubikiribōchō'], c: 2, e: 'The Totsuka Blade seals anyone it pierces into an eternal genjutsu dreamworld.' },
  { q: 'Which shield does Itachi\'s Susanoo carry?', a: ['Yata Mirror', 'Magatama Shield', 'Rashōmon', 'Gunbai'], c: 0, e: 'The Yata Mirror changes its nature to counter any attack, making Susanoo nearly invincible.' },
  { q: 'In Tsukuyomi, how long does Itachi torture Kakashi in their first fight?', a: ['24 hours', '72 hours', '7 days', '1 month'], c: 1, e: '72 hours pass inside the genjutsu — but only a moment passes in the real world.' },
  { q: 'Whose death awakened Itachi\'s Mangekyō Sharingan?', a: ['Fugaku Uchiha', 'Izumi Uchiha', 'Shisui Uchiha', 'Obito Uchiha'], c: 2, e: 'The loss of his best friend Shisui Uchiha awakened his Mangekyō.' },
  { q: 'Which technique did Itachi use to stop Kabuto during the Fourth Great Ninja War?', a: ['Izanagi', 'Kotoamatsukami', 'Izanami', 'Amaterasu'], c: 2, e: 'Izanami traps the target in a loop until they accept who they truly are.' },
  { q: 'At what age did Itachi graduate from the Ninja Academy?', a: ['5', '7', '10', '12'], c: 1, e: 'He graduated at 7 — top of his class.' },
  { q: 'What did Itachi secretly give Naruto through a crow?', a: ['Shisui\'s Sharingan', 'The Akatsuki ring', 'A forbidden scroll', 'His headband'], c: 0, e: 'Shisui\'s Mangekyō, loaded with Kotoamatsukami, meant to protect the Leaf if Sasuke attacked it.' },
  { q: 'Amaterasu\'s black flames are said to burn for how long?', a: ['Seven days and seven nights', 'Three hours', 'Until sunrise', 'One full moon'], c: 0, e: 'The flames of Amaterasu burn for seven days and nights and cannot be put out by ordinary means.' },
  { q: 'What gesture became Itachi\'s signature farewell to Sasuke?', a: ['A pat on the head', 'A poke on the forehead', 'A salute', 'A hand on the shoulder'], c: 1, e: '"Forgive me, Sasuke" — followed by that iconic forehead poke.' },
  { q: 'When is Itachi\'s birthday?', a: ['July 23', 'October 10', 'June 9', 'March 27'], c: 2, e: 'June 9. (July 23 is Sasuke\'s, October 10 is Naruto\'s.)' },
  { q: 'Who voices Itachi in the English dub?', a: ['Crispin Freeman', 'Yuri Lowenthal', 'Kyle Hebert', 'Troy Baker'], c: 0, e: 'Crispin Freeman in English; Hideo Ishikawa in Japanese.' },
  { q: 'Itachi\'s summoned animal of choice was…', a: ['Toads', 'Snakes', 'Crows', 'Slugs'], c: 2, e: 'Crows — used for genjutsu, clones and even to scatter his body in a feint.' },
];

export const TRIVIA = [
  'Itachi\'s natural genius meant he mastered skills in a fraction of the time — yet he always called himself a failure.',
  'He secretly suffered from a terminal illness and kept himself alive on medicine to face Sasuke one last time.',
  'His Mangekyō grants Tsukuyomi in the left eye and Amaterasu in the right.',
  'He could trap opponents in genjutsu with a single glance — meeting his eyes in battle was considered a fatal mistake.',
  'He was an ANBU captain at 13 — the age most ninja are still genin.',
  'Before dying he implanted Amaterasu inside Sasuke\'s eyes to protect him from Tobi.',
  'Itachi recognised Naruto as someone who could carry the Will of Fire — and entrusted him with Sasuke.',
  'His Susanoo\'s Totsuka Blade is actually the spirit of a sealing sword, not a physical weapon.',
  'In the Japanese version he is voiced by Hideo Ishikawa.',
  'Itachi\'s ninja registration number is 012110.',
];

export const HAND_SIGNS = [
  { key: 'rat', kanji: '子', name: 'Rat' },
  { key: 'ox', kanji: '丑', name: 'Ox' },
  { key: 'tiger', kanji: '寅', name: 'Tiger' },
  { key: 'hare', kanji: '卯', name: 'Hare' },
  { key: 'dragon', kanji: '辰', name: 'Dragon' },
  { key: 'snake', kanji: '巳', name: 'Snake' },
  { key: 'horse', kanji: '午', name: 'Horse' },
  { key: 'ram', kanji: '未', name: 'Ram' },
  { key: 'monkey', kanji: '申', name: 'Monkey' },
  { key: 'bird', kanji: '酉', name: 'Bird' },
  { key: 'dog', kanji: '戌', name: 'Dog' },
  { key: 'boar', kanji: '亥', name: 'Boar' },
];

export const JUTSU = [
  { key: 'fireball', name: 'Fire Style: Great Fireball', jp: '火遁・豪火球の術', seq: ['snake', 'ram', 'monkey', 'boar', 'horse', 'tiger'], note: 'The Uchiha rite of passage. Itachi performed it flawlessly as a child.' },
  { key: 'phoenix', name: 'Fire Style: Hōsenka Tsumabeni', jp: '火遁・鳳仙花爪紅', seq: ['rat', 'tiger', 'dog', 'ox', 'hare', 'tiger'], note: 'A volley of small fireballs with shuriken hidden inside them.' },
  { key: 'summon', name: 'Summoning: Crows', jp: '口寄せの術', seq: ['boar', 'dog', 'bird', 'monkey', 'ram'], note: 'Itachi\'s crows serve as scouts, clones and genjutsu mediums.' },
];
