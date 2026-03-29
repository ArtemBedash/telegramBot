export function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function formatMessage(text: string): string {
  const parts = text.split(/```/g);
  let result = "";

  parts.forEach((part, i) => {
    const escaped = escapeHtml(part);
    if (i % 2 === 1) {
      result += `<pre>${escaped}</pre>`;
      return;
    }
    result += escaped;
  });

  return result;
}
