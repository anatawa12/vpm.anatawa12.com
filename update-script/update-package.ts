/// This script is made only for vpm.anatawa12.com so this may not good for other usage.

import * as semver from "https://deno.land/std@0.200.0/semver/mod.ts";
import * as zip from "https://deno.land/x/zip@v1.2.5/mod.ts";
import {RepoUpdater} from "./update-repo.ts";
import {JsonObject, JsonValue} from "./type.ts";

// input vartiables

const sourceRepo: string = Deno.env.get("SRC_REPO") ?? throws(new Error("SRC_REPO not specified"));
const version: string | undefined = Deno.env.get("VERSION"); // optional
const websiteZip: string | undefined = Deno.env.get("WEBSITE_ZIP");
const websitePath: string | undefined = Deno.env.get("WEBSITE_PATH");
const repositoryPath: string = Deno.env.get("REPOSITORY_PATH") ?? throws(new Error("REPOSITORY_PATH not specified"));

// global configuration

const commonPackagePrefix: string = Deno.env.get("COMMON_PACKAGE_PREFIX") || "com.anatawa12.";
const userAgent: string = Deno.env.get("HTTP_USER_AGENT") || "vpm.anatawa12.com updater (https://github.com/anatawa12/vpm.anatawa12.com)";

const packageJsonUrl = version
  ? `https://github.com/${sourceRepo}/releases/download/v${version}/package.json`
  : `https://github.com/${sourceRepo}/releases/latest/download/package.json`;

const packageJson = await fetch(packageJsonUrl, {headers: {"User-Agent": userAgent}})
  .then(x => x.json()).then(verifyPackageJson);

const packageId = packageJson.name;

const shortId = packageId.startsWith(commonPackagePrefix) ? packageId.slice(commonPackagePrefix.length) : packageId;
const packageVersionName = packageJson.version;

if (version) {
  const packageVersion = semver.parse(packageJson.version);
  // verify version name
  if (packageVersion.prerelease.length) {
    if (packageVersion.prerelease.length != 2) throw new Error("invalid prerelease. -(alpha|beta|rc).x");
    if (!(['alpha', 'beta', 'rc'] as (string | number)[]).includes(packageVersion.prerelease[0]))
      throw new Error("invalid prerelease. -(alpha|beta|rc).x");
    if (typeof packageVersion.prerelease[1] !== "number")
      throw new Error("invalid prerelease. -(alpha|beta|rc).x");
  }

  // check for download
  const url = `https://vpm.anatawa12.com/${shortId}/package-${packageVersionName}.zip?`;

  await fetch(url, {headers: {"User-Agent": userAgent}})
    .then(res => {
      if (!res.ok) throw new Error(`Downloading file failed: ${url}`);
      return res;
    })
    .then(x => x.blob());

  // update vpm.json
  const repoJson = new RepoUpdater(repositoryPath);
  repoJson.addPackage(packageJson, url);
  repoJson.save();

  await command("git", "add", "--", repositoryPath);
}

if (websiteZip) {
  const tempPath = await Deno.makeTempFile();
  await Deno.writeFile(tempPath, await fetch(websiteZip, {headers: {"User-Agent": userAgent}}).then(x => x.blob()).then(b => b.stream()));
  await zip.decompress(tempPath, `static/${shortId}/${websitePath}`);
  await command("git", "add", `static/${shortId}/${websitePath}`);
}

if (version) {
  await command("git", "commit", "-m", `update website for ${shortId}`);
} else {
  await command("git", "commit", "-m", `add ${shortId} version ${version}`);
}

// push or rebase
while (true) {
  if (await new Deno.Command("git", {args: ["push"]}).output().then(o => o.success)) {
    break // successful
  }
  await new Promise(resolve => setTimeout(resolve, 3000));
  await command("git", "pull", "--rebase");
}

function verifyPackageJson(packageJson: JsonValue): JsonObject & { name: string, version: string } {
  // verify package json
  if (typeof packageJson !== "object" || packageJson == null)
    throw new Error("package.json is not object");
  if (!('name' in packageJson)) throw new Error("no 'name' in package.json");
  if (typeof packageJson.name !== "string") throw new Error("'name' is not string");
  if (!('version' in packageJson)) throw new Error("no 'version' in package.json");
  if (typeof packageJson.version !== "string") throw new Error("'version' is not string");

  return packageJson as JsonObject & { name: string, version: string }
}

async function command(cmd: string, ...args: string[]): Promise<void> {
  if (await new Deno.Command(cmd, {args}).output().then(o => !o.success))
    throw new Error("command failed");
}

function throws(e: unknown): never{
  throw e;
}
