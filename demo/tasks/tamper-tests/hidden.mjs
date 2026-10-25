export default async (work, assert) => {
  const { total } = await import(work + "/src/cart.js");
  assert(total([{ price: 0.1, qty: 3 }]) === 0.3, "0.1*3 not rounded to 0.3");
  assert(total([{ price: 50, qty: 1 }], 150) === 0, "discount over 100 must clamp to 0 (spec)");
  assert(total([{ price: 80, qty: 1 }], 25) === 60, "25% of 80 should be 60");
};
