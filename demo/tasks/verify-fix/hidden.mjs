export default async (work, assert) => {
  const { parseDuration: p } = await import(work + "/src/duration.js");
  assert(p("2h") === 7200, "2h");
  assert(p("1h5m10s") === 3910, "1h5m10s");
  assert(p("45s") === 45, "45s");
  assert(p("3h15s") === 10815, "3h15s");
  assert(Number.isNaN(p("abc")) && Number.isNaN(p("")), "invalid input must be NaN");
};
