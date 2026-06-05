import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const publicDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../.output/public",
);
const port = Number(process.env.PORT ?? 3000);
const host = process.env.HOST ?? "0.0.0.0";

const contentTypes = new Map([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".ico", "image/x-icon"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".png", "image/png"],
  [".txt", "text/plain; charset=utf-8"],
  [".webmanifest", "application/manifest+json; charset=utf-8"],
]);

function filePathForUrl(url) {
  const pathname = decodeURIComponent(new URL(url, "http://localhost").pathname);
  const requestedPath = path.resolve(
    publicDir,
    pathname === "/" ? "index.html" : pathname.slice(1),
  );

  if (!requestedPath.startsWith(publicDir)) {
    return path.join(publicDir, "index.html");
  }

  return requestedPath;
}

async function existingFile(filePath) {
  try {
    const fileStat = await stat(filePath);
    return fileStat.isFile() ? filePath : undefined;
  } catch {
    return undefined;
  }
}

const server = createServer(async (request, response) => {
  if (!request.url || request.method !== "GET") {
    response.writeHead(405).end();
    return;
  }

  const requestedFile = filePathForUrl(request.url);
  const filePath =
    (await existingFile(requestedFile)) ??
    path.join(publicDir, "index.html");
  const contentType =
    contentTypes.get(path.extname(filePath)) ??
    "application/octet-stream";

  response.writeHead(200, { "Content-Type": contentType });
  createReadStream(filePath).pipe(response);
});

server.listen(port, host, () => {
  console.log(`Web static server listening on http://${host}:${port}`);
});
