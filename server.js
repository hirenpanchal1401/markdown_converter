import grpc from "@grpc/grpc-js";
import protoLoader from "@grpc/proto-loader";

import { unified } from "unified";

import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkBreaks from "remark-breaks";
import remarkEmoji from "remark-emoji";

import remarkRehype from "remark-rehype";

import rehypeRaw from "rehype-raw";
import rehypeSanitize from "rehype-sanitize";
import rehypeHighlight from "rehype-highlight";
import rehypeStringify from "rehype-stringify";

import { defaultSchema } from "hast-util-sanitize";

import strip from "strip-markdown";
import remarkStringify from "remark-stringify";
import { remarkNormalize, normalizeMarkdownInput, normalizeHTMLOutput } from "./remarkNormalize.js";

/**
 * Proto load
 */
const packageDef = protoLoader.loadSync("markdown.proto");
const grpcObj = grpc.loadPackageDefinition(packageDef);
const markdownPackage = grpcObj.markdown;

/**
 * Sanitize schema
 */
const customSchema = {
  ...defaultSchema,
  tagNames: [...defaultSchema.tagNames, "mark"],
  attributes: {
    ...defaultSchema.attributes,
    code: [...(defaultSchema.attributes.code || []), "className"],
    span: [...(defaultSchema.attributes.span || []), "className"],
  },
};

/**
 * Processors (singleton)
 */
const htmlProcessor = unified()
  .use(remarkParse)
  .use(remarkNormalize, {
    code: "keep",
    enableMark: true,
  })
  .use(remarkGfm)
  .use(remarkBreaks)
  .use(remarkEmoji)
  .use(remarkRehype, { allowDangerousHtml: true })
  .use(rehypeRaw)
  .use(rehypeSanitize, customSchema)
  .use(rehypeHighlight)
  .use(rehypeStringify);

const textProcessor = unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(strip)
  .use(remarkStringify);

/**
 * gRPC Handlers
 */
async function toHtml(call, callback) {
  try {
    const markdown = normalizeMarkdownInput(call.request.markdown || "");
    const file = await htmlProcessor.process(markdown);

    callback(null, { output: normalizeHTMLOutput(file.toString()) });
  } catch (err) {
    callback(err);
  }
}

async function toText(call, callback) {
  try {
    const markdown = call.request.markdown || "";
    const file = await textProcessor.process(markdown);

    callback(null, { output: file.toString() });
  } catch (err) {
    callback(err);
  }
}

/**
 * Start server
 */
function main() {
  const server = new grpc.Server();

  server.addService(markdownPackage.MarkdownService.service, {
    ToHtml: toHtml,
    ToText: toText,
  });

  server.bindAsync(
    "0.0.0.0:50051",
    grpc.ServerCredentials.createInsecure(),
    () => {
      console.log("🚀 gRPC Server running on port 50051");
    }
  );
}

main();