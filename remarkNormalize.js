import { visit } from "unist-util-visit";
import { unified } from "unified";
import remarkParse from "remark-parse";

/**
 * Production-grade Markdown normalization plugin
 *
 * Options:
 *  - code: 'keep' | 'remove' | 'unwrap'
 *  - normalizeBreaks: boolean (convert soft line breaks to paragraphs)
 *  - enableMark: boolean (convert ==text== to <mark>)
 */
export const remarkNormalize = (options = {}) => {
  const {
    code = "keep", // 'keep' | 'remove' | 'unwrap'
    enableMark = true,
  } = options;

  return (tree) => {
    normalizeRoot(tree);
    normalizeInline(tree);
    normalizeCode(tree);
    normalizeHtmlBlocks(tree);
  };

  /**
   * Ensure root-level structure is valid
   */
  function normalizeRoot(tree) {
    if (!tree.children) return;

    const newChildren = [];

    tree.children.forEach((node) => {
      // Split stray text nodes into paragraphs
      if (node.type === "text" && node.value.trim()) {
        newChildren.push({
          type: "paragraph",
          children: [{ type: "text", value: node.value }],
        });
      } else {
        newChildren.push(node);
      }
    });

    tree.children = newChildren;
  }

  /**
   * Normalize inline formatting (bold/italic/mark)
   */
  function normalizeInline(tree) {
    visit(tree, "text", (node, index, parent) => {
      if (!node.value) return;

      if (enableMark && node.value.includes("==")) {
        const parts = node.value.split(/(==.*?==)/g);

        const nodes = parts.map((part) => {
          if (/^==.*==$/.test(part)) {
            return {
              type: "html",
              value: `<mark>${part.slice(2, -2)}</mark>`,
            };
          }
          return { type: "text", value: part };
        });

        parent.children.splice(index, 1, ...nodes);
      }
    });

    // flatten nesting
    visit(tree, ["strong", "emphasis"], (node) => {
      node.children = node.children.flatMap((child) =>
        child.type === node.type ? child.children : child,
      );
    });
  }

  /**
   * Handle code blocks
   */
  function normalizeCode(tree) {
    if (code === "keep") return;

    visit(tree, "code", (node, index, parent) => {
      if (code === "remove") {
        parent.children.splice(index, 1);
        return;
      }

      // 'unwrap': treat the code block's contents as markdown source
      const parsed = unified().use(remarkParse).parse(node.value);
      parent.children.splice(index, 1, ...parsed.children);
    });
  }

  /**
   * Ensure HTML blocks are isolated
   */
  function normalizeHtmlBlocks(tree) {
    visit(tree, "html", (node, index, parent) => {
      // Wrap inline HTML in paragraph if needed
      if (parent.type !== "paragraph") {
        parent.children[index] = {
          type: "paragraph",
          children: [node],
        };
      }
    });
  }
};

function fixPunctuationSpacing(text) {
  return text
    // normalize NBSP first
    .replace(/\u00A0/g, " ")

    // remove space before closing * or _
    .replace(/[ \t]+([_*])[ \t]*$/gm, "$1")
}

export const normalizeMarkdownInput = (md) => {
  if (!md) return "";

  let output = md;

  output = output.replace(/\r\n/g, "\n");
  output = fixPunctuationSpacing(output);

  return output;
};

export const normalizeHTMLOutput = (html) => {
  if (!html) return "";

  let output = html;

  // Remove empty paragraph tags inserted inside inline wrappers.
  output = output.replace(
    /<(em|strong|span|b|i|u)[^>]*>\s*(<p[^>]*>\s*<\/p>)+/gi,
    "<$1>"
  );
  output = output.replace(
    /(<p[^>]*>\s*<\/p>)+\s*<\/(em|strong|span|b|i|u)>/gi,
    "</$2>"
  );
  output = output.replace(/<(em|strong|span|b|i|u)[^>]*>\s*<\/\1>/gi, "");

  // Remove \n and \r characters from the output
  output = output.replace(/[\n\r]/g, "");

  return output;
};