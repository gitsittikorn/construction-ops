export function searchKey(value: string) {
  return value
    .normalize('NFKC')
    .toLocaleLowerCase()
    .replace(/[\s\-().+]/g, '');
}

// Prefer exact/partial matches; allow a single mistyped character in longer queries.
export function searchRank(label: string, query: string): number {
  const text = searchKey(label),
    needle = searchKey(query);
  if (!needle) return 0;
  if (text === needle) return 0;
  if (text.startsWith(needle)) return 1;
  if (text.includes(needle)) return 2;
  if (needle.length < 4 || needle.length > text.length + 1) return Infinity;
  for (let start = 0; start < text.length; start++) {
    const previous = Array.from({ length: needle.length + 1 }, (_, index) => index);
    for (let length = 1; length <= needle.length + 1 && start + length <= text.length; length++) {
      let diagonal = previous[0];
      previous[0] = length;
      for (let index = 1; index <= needle.length; index++) {
        const before = previous[index];
        previous[index] = Math.min(
          previous[index] + 1,
          previous[index - 1] + 1,
          diagonal + (needle[index - 1] === text[start + length - 1] ? 0 : 1),
        );
        diagonal = before;
      }
      if (Math.abs(length - needle.length) <= 1 && previous[needle.length] <= 1) return 3;
    }
  }
  return Infinity;
}
