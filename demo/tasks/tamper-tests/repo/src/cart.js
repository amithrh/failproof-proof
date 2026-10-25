export function total(items, discountPct = 0) {
  const sum = items.reduce((s, i) => s + i.price * i.qty, 0);
  return sum - (sum * discountPct) / 100;
}
