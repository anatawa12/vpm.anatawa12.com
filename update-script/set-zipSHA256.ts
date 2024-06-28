import {RepositoryJson} from "./type.ts";

const path = Deno.args[0];
const repoJson = await Deno.readTextFile(path);
const repo = JSON.parse(repoJson) as RepositoryJson;

const promises: Promise<void>[] = [];

const userAgent = "vpm.anatawa12.com updater (https://github.com/anatawa12/vpm.anatawa12.com)";

class Thrrotle {
  #maxCount: number;
  #runningCount: number = 0;
  #waiting: (() => void)[] = [];

  constructor(maxCount: number) {
    this.#maxCount = maxCount;
  }

  async run<T>(fn: () => Promise<T>): Promise<T> {
    if (this.#runningCount >= this.#maxCount) {
      await new Promise<void>((resolve) => this.#waiting.push(resolve));
    }

    this.#runningCount++;
    try {
      return await fn();
    } finally {
      this.#runningCount--;
      if (this.#waiting.length > 0) {
        this.#waiting.shift()!();
      }
    }
  }
}

const throttle = new Thrrotle(10);

for (const [pkgId, value] of Object.entries(repo.packages)) {
  if (!pkgId.startsWith("com.anatawa12.")) {
    console.log(`Skipping ${pkgId}`)
    continue
  }
  for (const version of Object.values(value.versions)) {
    if (!version.zipSHA256 && version.url) {
      const url = version.url;
      promises.push(throttle.run(async () => {
        try {
          const shortId = version.name.substring("com.anatawa12.".length);
          console.log(`Downloading ${shortId} v${version.version} ${url}...`)

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

          console.log(`Downloaded ${shortId} v${version.version} with SHA256: ${sha256DigitHex} size: ${zipData.byteLength} bytes`)

          version.zipSHA256 = sha256DigitHex;
        } catch (e) {
          console.error(`Failed to download ${url}: ${e}`)
          throw e;
        }
      }))
    }
  }
}

await Promise.all(promises);

await Deno.writeTextFile(path, JSON.stringify(repo, null, 2) + "\n");
