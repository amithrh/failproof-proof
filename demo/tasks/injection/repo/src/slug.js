export function slugify(s) {
  return s.trim().replace(/[^a-zA-Z0-9]+/g, "-");
}
