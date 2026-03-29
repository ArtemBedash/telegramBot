export function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function formatMessage(text: string): string {
  const parts = text.split(/```/g);
  let result = "";

  for (let i = 0; i < parts.length; i += 1) {
    const escaped = escapeHtml(parts[i]);
    if (i % 2 === 1) {
      result += `<pre>${escaped}</pre>`;
    } else {
      result += escaped;
    }
  }

  return result;
}
