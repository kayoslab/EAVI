// Shared colour helpers. Pure module: functions only, no bindings.

export fn hsv2rgb(c: vec3f) -> vec3f {
  let k = vec4f(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
  let p = abs(fract(c.xxx + k.xyz) * 6.0 - k.www);
  return c.z * mix(k.xxx, clamp(p - k.xxx, vec3f(0.0), vec3f(1.0)), c.y);
}

export fn hueToRgb(hueDegrees: f32, saturation: f32, value: f32) -> vec3f {
  return hsv2rgb(vec3f(fract(hueDegrees / 360.0), saturation, value));
}
