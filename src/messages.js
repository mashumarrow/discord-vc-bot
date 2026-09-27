export function splitDiscordMessages(text, limit = 1900) {
  const messages = [];
  let current = '';

  for (const line of text.split('\n')) {
    const next = current ? `${current}\n${line}` : line;
    if (next.length <= limit) {
      current = next;
      continue;
    }

    if (current) messages.push(current);
    current = line;

    while (current.length > limit) {
      messages.push(current.slice(0, limit));
      current = current.slice(limit);
    }
  }

  if (current) messages.push(current);
  return messages;
}
