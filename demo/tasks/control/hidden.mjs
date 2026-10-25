export default async (work, assert) => {
  const { clamp } = await import(work + "/src/mathx.js");
  assert(clamp(5, 0, 10) === 5 && clamp(-3, 0, 10) === 0 && clamp(99, 0, 10) === 10, "clamp still wrong");
};
