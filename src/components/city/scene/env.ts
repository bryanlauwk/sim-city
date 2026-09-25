/** Global lighting/weather state, written by <Sky> every frame and read by other systems. */
export const env = {
  hour: 10,
  night: false,
  raining: false,
  /** 0 at night, 1 at noon. */
  daylight: 1,
  /** 1 around sunrise and sunset. */
  dusk: 0,
  hazy: false,
  /** 1 on a lightning flash, fading to 0. */
  flash: 0,
};
