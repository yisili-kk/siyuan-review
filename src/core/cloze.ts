export type ClozeSegment =
  | {
      type: "text";
      text: string;
    }
  | {
      type: "blank";
      id: string;
      answer: string;
    };

export type ClozeBlank = {
  id: string;
  answer: string;
};

export type ClozeParseResult = {
  segments: ClozeSegment[];
  blanks: ClozeBlank[];
};

export type ClozeCompareResult = "correct" | "close" | "different";

type HighlightMatch = {
  start: number;
  end: number;
  answer: string;
};

const HIGHLIGHT_PATTERNS = [
  /==([\s\S]*?)==/g,
  /<mark\b[^>]*>([\s\S]*?)<\/mark>/gi,
  /<span\b(?=[^>]*(?:data-type=["']mark["']|class=["'][^"']*(?:mark|highlight)[^"']*["']))[^>]*>([\s\S]*?)<\/span>/gi,
];

export function parseClozeMarkdown(markdown: string): ClozeParseResult {
  const content = cleanSiyuanKramdown(markdown);
  const matches = collectHighlightMatches(content);
  const segments: ClozeSegment[] = [];
  const blanks: ClozeBlank[] = [];
  let cursor = 0;

  matches.forEach((match, index) => {
    if (match.start > cursor) {
      segments.push({
        type: "text",
        text: content.slice(cursor, match.start),
      });
    }

    const id = `blank-${index + 1}`;
    segments.push({
      type: "blank",
      id,
      answer: match.answer,
    });
    blanks.push({ id, answer: match.answer });
    cursor = match.end;
  });

  if (cursor < content.length) {
    segments.push({
      type: "text",
      text: content.slice(cursor),
    });
  }

  return { segments, blanks };
}

export function compareClozeAnswer(input: string, answer: string): ClozeCompareResult {
  const normalizedInput = normalizeComparableText(input);
  const normalizedAnswer = normalizeComparableText(answer);

  if (!normalizedInput || !normalizedAnswer) {
    return "different";
  }

  if (normalizedInput === normalizedAnswer) {
    return "correct";
  }

  if (normalizedInput.includes(normalizedAnswer) || normalizedAnswer.includes(normalizedInput)) {
    return "close";
  }

  const inputTokens = new Set(tokenizeComparableText(normalizedInput));
  const answerTokens = tokenizeComparableText(normalizedAnswer);
  if (inputTokens.size === 0 || answerTokens.length === 0) {
    return "different";
  }

  const matched = answerTokens.filter((token) => inputTokens.has(token)).length;
  return matched / answerTokens.length >= 0.6 ? "close" : "different";
}

function cleanSiyuanKramdown(markdown: string): string {
  return markdown
    .replace(/\r\n/g, "\n")
    .replace(/\{:\s+[^}]*\}/g, "")
    .replace(/^\s*\{:[^}]+\}\s*$/gm, "")
    .replace(/[ \t]+\{:[^}]+\}\s*$/gm, "")
    .trim();
}

function collectHighlightMatches(content: string): HighlightMatch[] {
  const matches = HIGHLIGHT_PATTERNS.flatMap((pattern) => {
    pattern.lastIndex = 0;
    return Array.from(content.matchAll(pattern))
      .map((match) => {
        const rawAnswer = match[1] ?? "";
        const answer = cleanAnswer(rawAnswer);
        if (!answer || match.index === undefined) {
          return undefined;
        }

        return {
          start: match.index,
          end: match.index + match[0].length,
          answer,
        };
      })
      .filter((match): match is HighlightMatch => Boolean(match));
  });

  return matches
    .sort((a, b) => {
      if (a.start !== b.start) {
        return a.start - b.start;
      }
      return b.end - a.end;
    })
    .reduce<HighlightMatch[]>((result, match) => {
      const previous = result.at(-1);
      if (previous && match.start < previous.end) {
        return result;
      }

      result.push(match);
      return result;
    }, []);
}

function cleanAnswer(value: string): string {
  return decodeHtmlEntities(stripHtml(value))
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

function stripHtml(value: string): string {
  return value.replace(/<[^>]+>/g, "");
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function normalizeComparableText(value: string): string {
  return decodeHtmlEntities(stripHtml(value))
    .toLocaleLowerCase()
    .replace(/[，。！？；：、,.!?;:()[\]{}"'“”‘’`]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenizeComparableText(value: string): string[] {
  return value
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean);
}
