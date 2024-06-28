import {RepositoryJson} from "./type.ts";

const path = Deno.args[0];
const repoJson = await Deno.readTextFile(path);
const repo = JSON.parse(repoJson) as RepositoryJson;

const promises: Promise<void>[] = [];

const userAgent = "vpm.anatawa12.com updater (https://github.com/anatawa12/vpm.anatawa12.com)";

for (const value of Object.values(repo.packages)) {
  for (const version of Object.values(value.versions)) {
    if (!version.zipSHA256 && version.url) {
      const url = version.url;
      promises.push((async () => {
        try {
          console.log(`Downloading ${url} (${version.name} v${version.version})...`)
          const zipData = await fetch(url, {headers: {"User-Agent": userAgent}})
            .then(res => {
              if (!res.ok) throw new Error(`Downloading file failed: ${url}`);
              return res;
            })
            .then(x => x.arrayBuffer());

          const sha256Digit = await crypto.subtle.digest("SHA-256", zipData);
          const sha256DigitHex = Array.from(new Uint8Array(sha256Digit))
            .map((b) => b.toString(16).padStart(2, "0"))
            .join("")

          console.log(`Downloaded ${url} with SHA256: ${sha256DigitHex}`)

          version.zipSHA256 = sha256DigitHex;
        } catch (e) {
          console.error(`Failed to download ${url}: ${e}`)
          throw e;
        }
      })())
    }
  }
}

await Promise.all(promises);

await Deno.writeTextFile(path, JSON.stringify(repo, null, 2) + "\n");
