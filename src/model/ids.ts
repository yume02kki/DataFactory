let counter = 0;

/** Short, collision-resistant ids that stay readable in exported JSON. */
export function uid(prefix: string): string {
  counter = (counter + 1) % 1296;
  const rand = Math.random().toString(36).slice(2, 8);
  const time = Date.now().toString(36).slice(-4);
  return `${prefix}_${time}${counter.toString(36).padStart(2, '0')}${rand}`;
}
