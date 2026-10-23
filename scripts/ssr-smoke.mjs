import { spawn } from "node:child_process";
import assert from "node:assert/strict";
import { stripVTControlCharacters } from "node:util";

const server = spawn(
  process.execPath,
  ["node_modules/vite/bin/vite.js", "--host", "127.0.0.1", "--port", "4178", "--strictPort"],
  { stdio: ["ignore", "pipe", "pipe"] },
);
let output = "";
server.stdout.on("data", (data) => {
  output += data;
});
server.stderr.on("data", (data) => {
  output += data;
});
try {
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Server did not start: ${output}`)), 25000);
    const poll = setInterval(() => {
      if (stripVTControlCharacters(output).includes("127.0.0.1:4178")) {
        clearInterval(poll);
        clearTimeout(timer);
        resolve();
      }
    }, 100);
    server.once("exit", (code) => {
      clearInterval(poll);
      clearTimeout(timer);
      reject(new Error(`Server exited ${code}: ${output}`));
    });
  });
  for (const path of [
    "/",
    "/today",
    "/routines",
    "/goals",
    "/proof",
    "/requests",
    "/notes",
    "/agreements",
    "/discussion",
    "/activity",
    "/settings",
  ]) {
    const response = await fetch(`http://127.0.0.1:4178${path}`);
    const html = await response.text();
    assert.equal(response.status, 200, `${path}: ${html.slice(0, 250)}`);
    assert.ok(html.includes("Nocturne"), `${path}: missing app markup`);
    assert.ok(!html.includes("fonts.googleapis.com"), `${path}: unexpected external font request`);
    console.log(`PASS SSR ${path} (200)`);
  }
} finally {
  server.kill("SIGTERM");
}
