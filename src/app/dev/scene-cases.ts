// The states of the game the scene review page can show: /?view=scene&case=<name>.
export const SCENE_CASES = ['waiting', 'intro', 'run', 'hurt', 'low', 'ghost', 'speed', 'double', 'heart', 'night', 'over'] as const;

export type SceneCase = (typeof SCENE_CASES)[number];
