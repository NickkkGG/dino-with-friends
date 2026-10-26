// The new pixel pictures, as rows of cells: '#' is filled, '.' is empty. Drawn with fillCells in one colour.

/** The skill box: a "?" inside a double frame. */
export const BOX: readonly string[] = [
  '################',
  '#..............#',
  '#.############.#',
  '#.#..........#.#',
  '#.#...####...#.#',
  '#.#..#....#..#.#',
  '#.#.......#..#.#',
  '#.#......#...#.#',
  '#.#.....#....#.#',
  '#.#.....#....#.#',
  '#.#..........#.#',
  '#.#.....#....#.#',
  '#.#..........#.#',
  '#.############.#',
  '#..............#',
  '################',
];

/** A heart the player still has. */
export const HEART: readonly string[] = ['.##.##.', '#######', '#######', '.#####.', '..###..', '...#...'];

/** A heart the player has lost. */
export const HEART_EMPTY: readonly string[] = ['.##.##.', '#..#..#', '#.....#', '.#...#.', '..#.#..', '...#...'];

/** The spark where the dino hits an obstacle. */
export const SPARK: readonly string[] = ['#.....#', '.#...#.', '...#...', '..###..', '...#...', '.#...#.', '#.....#'];

/** A drop of sweat falling from a dino with one heart left. */
export const SWEAT: readonly string[] = ['.#.', '.#.', '###', '###', '.#.'];

/** The puff under the dino's feet on a second jump in mid-air. */
export const PUFF: readonly string[] = ['..##..##..', '.#..##..#.', '#........#', '.########.'];

/** DOUBLE JUMP: two arrows up. */
export const ICON_DOUBLE_JUMP: readonly string[] = ['...#...', '..###..', '.#####.', '...#...', '..###..', '.#####.', '...#...'];

/** SPEED: two chevrons forward. */
export const ICON_SPEED: readonly string[] = [
  '#...#....', '.#...#...', '..#...#..', '...#...#.', '..#...#..', '.#...#...', '#...#....',
];

/** GHOST: a dino head facing right, drawn dotted. */
export const ICON_GHOST: readonly string[] = ['.######', '##.####', '#######', '#######', '####...', '######.', '###....'];

/** The sound button while sound is on: a speaker and two waves. */
export const SPEAKER_ON: readonly string[] = [
  '...#..#..', '..##...#.', '####.#..#', '####.#..#', '####.#..#', '..##...#.', '...#..#..',
];

/** The sound button while sound is off: the same speaker and a cross. */
export const SPEAKER_OFF: readonly string[] = [
  '...#.....', '..##.....', '####.#.#.', '####..#..', '####.#.#.', '..##.....', '...#.....',
];
