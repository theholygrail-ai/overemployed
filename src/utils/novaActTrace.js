/**
 * Split in-memory trace lines into Playground-style "reasoning" vs "activity".
 * Think steps are logged with 💭 from novaActPlaywrightTools.
 */
export function splitNovaActTraceLines(lines) {
  const thinking = [];
  const activity = [];
  if (!Array.isArray(lines)) return { thinking, activity };
  for (const line of lines) {
    const s = String(line);
    if (s.includes('💭')) thinking.push(s);
    else activity.push(s);
  }
  return { thinking, activity };
}
