import { createElement, Fragment, type ReactNode } from 'react';
import MarkdownIt from 'markdown-it';
import type Token from 'markdown-it/lib/token.mjs';

// Безопасный показ Markdown (ADR-017): HTML в тексте выключен, разбор markdown-it
// переводится в элементы React по белому списку — без dangerouslySetInnerHTML.
const md = new MarkdownIt({ html: false, linkify: true, breaks: true });

interface Node {
  token: Token;
  /** Для парных тегов — дочерние узлы между open и close. */
  children: Node[];
}

function tree(tokens: Token[]): Node[] {
  const root: Node[] = [];
  const stack: Node[][] = [root];
  for (const token of tokens) {
    const top = stack[stack.length - 1] as Node[];
    if (token.nesting === 1) {
      const node: Node = { token, children: [] };
      top.push(node);
      stack.push(node.children);
    } else if (token.nesting === -1) {
      if (stack.length > 1) stack.pop();
    } else top.push({ token, children: [] });
  }
  return root;
}

const SAFE_LINK = /^(https?:|mailto:)/i;
const TASK = /^\[( |x|X)\](?:\s+|$)/;

interface Ctx {
  /** Счётчик пунктов чек-листа в порядке показа (совпадает с checklistItems). */
  task: number;
  onToggle: ((index: number) => void) | undefined;
}

function inline(nodes: Token[], skipTask: boolean): ReactNode[] {
  const out: ReactNode[] = [];
  const stack: { tag: string; props: Record<string, unknown>; kids: ReactNode[] }[] = [];
  const push = (n: ReactNode) => (stack.at(-1)?.kids ?? out).push(n);
  const open = (tag: string, props: Record<string, unknown> = {}) =>
    stack.push({ tag, props, kids: [] });
  const close = () => {
    const f = stack.pop();
    if (f) push(createElement(f.tag, { ...f.props, key: out.length + stack.length }, ...f.kids));
  };
  nodes.forEach((t, i) => {
    switch (t.type) {
      case 'text': {
        const content = i === 0 && skipTask ? t.content.replace(TASK, '') : t.content;
        if (content) push(content);
        break;
      }
      case 'softbreak':
      case 'hardbreak':
        push(<br key={`br${i}`} />);
        break;
      case 'code_inline':
        push(<code key={`c${i}`}>{t.content}</code>);
        break;
      case 'strong_open':
        open('strong');
        break;
      case 'em_open':
        open('em');
        break;
      case 's_open':
        open('s');
        break;
      case 'link_open': {
        const href = t.attrGet('href') ?? '';
        if (SAFE_LINK.test(href)) open('a', { href, rel: 'noopener noreferrer', target: '_blank' });
        else open('span');
        break;
      }
      case 'strong_close':
      case 'em_close':
      case 's_close':
      case 'link_close':
        close();
        break;
      case 'image':
        if (t.content) push(t.content);
        break;
      default:
        break;
    }
  });
  while (stack.length) close();
  return out;
}

function blocks(nodes: Node[], ctx: Ctx): ReactNode[] {
  return nodes.map((n, i) => block(n, ctx, i));
}

function listItem(n: Node, ctx: Ctx, key: number): ReactNode {
  const first = n.children[0];
  const inl = first?.token.type === 'paragraph_open' ? first.children[0]?.token.children : null;
  const head = inl?.[0];
  const task = head?.type === 'text' ? TASK.exec(head.content) : null;
  if (!task) return <li key={key}>{blocks(n.children, ctx)}</li>;
  const index = ctx.task++;
  const checked = task[1] !== ' ';
  const label = (inl ? inline(inl, true) : []).map((x, k) => <Fragment key={k}>{x}</Fragment>);
  const rest = n.children.slice(1);
  return (
    <li key={key} className="task">
      <label>
        <input
          type="checkbox"
          checked={checked}
          disabled={!ctx.onToggle}
          onChange={() => ctx.onToggle?.(index)}
        />{' '}
        <span className={checked ? 'done' : undefined}>{label}</span>
      </label>
      {blocks(rest, ctx)}
    </li>
  );
}

function block(n: Node, ctx: Ctx, key: number): ReactNode {
  const t = n.token;
  switch (t.type) {
    case 'paragraph_open': {
      const kids = n.children[0]?.token.children ?? [];
      if (t.hidden) return <Fragment key={key}>{inline(kids, false)}</Fragment>;
      return <p key={key}>{inline(kids, false)}</p>;
    }
    case 'heading_open': {
      // Заголовки опускаются на два уровня: h1 страницы и h2 раздела заняты.
      const level = Math.min(6, Number(t.tag.slice(1)) + 2);
      return createElement(
        `h${level}`,
        { key },
        ...inline(n.children[0]?.token.children ?? [], false),
      );
    }
    case 'bullet_list_open':
      return <ul key={key}>{n.children.map((c, i) => listItem(c, ctx, i))}</ul>;
    case 'ordered_list_open':
      return <ol key={key}>{n.children.map((c, i) => listItem(c, ctx, i))}</ol>;
    case 'blockquote_open':
      return <blockquote key={key}>{blocks(n.children, ctx)}</blockquote>;
    case 'table_open':
      return <table key={key}>{blocks(n.children, ctx)}</table>;
    case 'thead_open':
      return <thead key={key}>{blocks(n.children, ctx)}</thead>;
    case 'tbody_open':
      return <tbody key={key}>{blocks(n.children, ctx)}</tbody>;
    case 'tr_open':
      return <tr key={key}>{blocks(n.children, ctx)}</tr>;
    case 'th_open':
      return <th key={key}>{inline(n.children[0]?.token.children ?? [], false)}</th>;
    case 'td_open':
      return <td key={key}>{inline(n.children[0]?.token.children ?? [], false)}</td>;
    case 'fence':
    case 'code_block':
      return (
        <pre key={key}>
          <code>{t.content}</code>
        </pre>
      );
    case 'hr':
      return <hr key={key} />;
    default:
      return null;
  }
}

/**
 * Показ Markdown. `onToggle` делает пункты «- [ ]» кликабельными (номер — по порядку в тексте);
 * без него пункты только показываются.
 */
export function Markdown({
  text,
  onToggle,
  className,
}: {
  text: string;
  onToggle?: (index: number) => void;
  className?: string;
}) {
  const ctx: Ctx = { task: 0, onToggle };
  return (
    <div className={`md${className ? ` ${className}` : ''}`}>
      {blocks(tree(md.parse(text, {})), ctx)}
    </div>
  );
}
