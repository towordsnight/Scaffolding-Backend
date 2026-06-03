import { parse, type MathNode, type SymbolNode } from 'mathjs';

const TEX_OPTIONS = {
  parenthesis: 'keep',
  implicit: 'hide',
  handler: renderSymbolNode,
};

const SIMPLE_SYMBOL_PATTERN = /^([A-Za-z])([A-Za-z]+|\d+)$/;

export function plainMathToTex(value: string): string | null {
  const lines = value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length === 0) return null;

  const renderedLines: string[] = [];
  for (const line of lines) {
    const renderedLine = renderEquationLine(line);
    if (!renderedLine) return null;
    renderedLines.push(renderedLine);
  }

  if (renderedLines.length === 1) return renderedLines[0];
  return `\\begin{gathered}${renderedLines.join('\\\\')}\\end{gathered}`;
}

function renderEquationLine(line: string) {
  const parts = line.split('=');
  const renderedParts: string[] = [];

  for (const part of parts) {
    const expression = part.trim();
    if (!expression) return null;

    try {
      renderedParts.push(cleanTex(parse(expression).toTex(TEX_OPTIONS)));
    } catch {
      return null;
    }
  }

  return renderedParts.join('=');
}

function renderSymbolNode(node: MathNode) {
  if (!isSymbolNode(node)) return undefined;

  return symbolNameToTex(node.name);
}

function isSymbolNode(node: MathNode): node is SymbolNode {
  return node.type === 'SymbolNode';
}

function symbolNameToTex(name: string) {
  const match = SIMPLE_SYMBOL_PATTERN.exec(name);
  if (!match) return name;

  const [, base, subscript] = match;
  if (/^\d$/.test(subscript)) return `${base}_${subscript}`;
  return `${base}_{${subscript}}`;
}

function cleanTex(tex: string) {
  return tex
    .replace(/~/g, '')
    .replace(/\\mathrm\{([A-Za-z])\}/g, '$1');
}
