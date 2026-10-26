// The numbers the simulation runs on: the original game's values, and the rules added for DINO with FRIENDS.

// World and fixed step
export const STEP_MS = 1000 / 60;
export const WORLD_W = 600;
export const WORLD_H = 150;

// Base speed
export const SPEED_START = 6;
export const SPEED_ACCEL = 0.001;
export const SPEED_MAX = 13;

// Obstacles
export const CLEAR_STEPS = 180; // clearTime 3000 ms
export const GAP_COEFFICIENT = 0.6;
export const MAX_GAP_COEFFICIENT = 1.5;
export const MAX_OBSTACLE_LENGTH = 3;
export const MAX_OBSTACLE_DUPLICATION = 2;

// Score and night
export const SCORE_COEFFICIENT = 0.025;
export const ACHIEVEMENT_SCORE = 100;
export const NIGHT_SCORE = 700;
export const NIGHT_STEPS = 720;

// Dino
export const TREX_X = 24;
export const INTRO_STEPS = 24;
export const GROUND_Y = 93;
export const TREX_W = 44;
export const TREX_W_DUCK = 59;
export const TREX_H = 47;

// Jump physics
export const GRAVITY = 0.6;
export const INITIAL_JUMP_VELOCITY = -10;
export const MAX_JUMP_HEIGHT = 30;
export const MIN_JUMP_Y = 63;
export const DROP_VELOCITY = -5;
export const SPEED_DROP_COEFFICIENT = 3;

// Health and slowdown
export const HP_START = 3;
export const HP_MAX = 5;
export const HURT_STEPS = 21;
export const INVULN_STEPS = 90;
export const SLOW_MIN = 0.4;
export const SLOW_RECOVER_STEPS = 150;

// Skills
export const SKILL_STEPS: Readonly<{ doubleJump: number; ghost: number; speed: number }> = {
  doubleJump: 600,
  ghost: 300,
  speed: 180,
};
export const SPEED_SKILL_MULTIPLIER = 1.5;
export const LABEL_STEPS = 48;

// Boxes
export const BOX_SIZE = 16;
export const BOX_Y = 96;
export const BOX_FIRST_TARGET: readonly [number, number] = [150, 300];
export const BOX_NEXT_TARGET: readonly [number, number] = [400, 700];
export const BOX_SEARCH_GAPS = 5;
export const BOX_GAP_PER_SPEED = 64;
export const BOX_GAP_MARGIN = 40;
