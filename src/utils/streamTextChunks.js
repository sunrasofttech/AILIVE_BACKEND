/**
 * Drain speakable phrases from a streaming LLM token buffer for low-latency TTS.
 * Emits on punctuation boundaries and on long clauses without waiting for a full sentence.
 */
function drainStreamingPhrases(buffer, { minPhraseChars = 14, maxBufferChars = 92 } = {}) {
  const phrases = [];
  let remainder = buffer;

  const strongBoundaryPattern = new RegExp(`(.{${minPhraseChars},}?)([.!?])(\\s+)`);
  const softBoundaryPattern = new RegExp(`(.{${minPhraseChars + 10},}?)([,;:])(\\s+)`);

  while (true) {
    const match = remainder.match(strongBoundaryPattern) || remainder.match(softBoundaryPattern);
    if (match) {
      const index = match.index + match[1].length + match[2].length;
      const phrase = remainder.substring(0, index).trim();
      remainder = remainder.substring(index).trim();
      if (phrase) phrases.push(phrase);
      continue;
    }

    if (remainder.length >= maxBufferChars) {
      const searchWindow = remainder.substring(0, maxBufferChars);
      const naturalBreak = Math.max(
        searchWindow.lastIndexOf(' and '),
        searchWindow.lastIndexOf(' but '),
        searchWindow.lastIndexOf(' so '),
        searchWindow.lastIndexOf(' because '),
        searchWindow.lastIndexOf(' then ')
      );
      const spaceIdx = naturalBreak >= minPhraseChars
        ? naturalBreak
        : remainder.lastIndexOf(' ', maxBufferChars - 12);
      if (spaceIdx >= minPhraseChars) {
        phrases.push(remainder.substring(0, spaceIdx).trim());
        remainder = remainder.substring(spaceIdx).trim();
        continue;
      }
    }

    break;
  }

  return { phrases, remainder };
}

module.exports = {
  drainStreamingPhrases,
};
