/**
 * Drain speakable phrases from a streaming LLM token buffer for low-latency TTS.
 * Emits on punctuation boundaries and on long clauses without waiting for a full sentence.
 */
function drainStreamingPhrases(buffer, { minPhraseChars = 6, maxBufferChars = 48 } = {}) {
  const phrases = [];
  let remainder = buffer;

  const boundaryPattern = new RegExp(`(.{${minPhraseChars},}?)([.!?,:;])(\\s+)`);

  while (true) {
    const match = remainder.match(boundaryPattern);
    if (match) {
      const index = match.index + match[1].length + match[2].length;
      const phrase = remainder.substring(0, index).trim();
      remainder = remainder.substring(index).trim();
      if (phrase) phrases.push(phrase);
      continue;
    }

    if (remainder.length >= maxBufferChars) {
      const spaceIdx = remainder.lastIndexOf(' ', maxBufferChars - 8);
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
