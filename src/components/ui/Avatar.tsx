export function Avatar({ name }: { name: string }) {
  const words = name.trim().split(/\s+/);
  const initials = `${words[0]?.[0] ?? ''}${words.at(-1)?.[0] ?? ''}`;
  return (
    <span className="avatar" aria-hidden="true">
      {initials}
    </span>
  );
}
