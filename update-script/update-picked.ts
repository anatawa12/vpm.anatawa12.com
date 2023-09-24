/// The script to copy some package from other repository.

import {parse as parseSemver, parseRange, SemVerRange, testRange} from "https://deno.land/std@0.200.0/semver/mod.ts";
import {RepoUpdater} from "./update-repo.ts";
import {RepositoryJson} from "./type.ts";

// input vartiables

const repositoryPath: string = Deno.env.get("REPOSITORY_PATH") ?? throws(new Error("REPOSITORY_PATH not specified"));
const userAgent: string = Deno.env.get("HTTP_USER_AGENT") || "vpm.anatawa12.com updater (https://github.com/anatawa12/vpm.anatawa12.com)";

type PackageConfig = { pkg: string, range?: SemVerRange, prerelease?: boolean };

const config: Record<string, PackageConfig[]> = {
  "https://vpm.nadena.dev/vpm-prerelease.json": [
    {pkg: "nadena.dev.ndmf", range: parseRange(">= 0.3.0")},
  ],
};

const repoJson = new RepoUpdater(repositoryPath);
for (const [removePath, packages] of Object.entries(config)) {
  const remoteRepo = await fetch(removePath, {headers: {"User-Agent": userAgent}}).then(x => x.json()) as RepositoryJson;

  for (const pkgInfo of packages) {
    const {pkg: packageId} = pkgInfo;
    const packageInfo = remoteRepo.packages[packageId];
    if (!packageInfo) throw new Error(`${packageId} not found`);
    for (const [version, packageJson] of Object.entries(packageInfo.versions)) {
      if (includeVersion(version, pkgInfo)) {
        if (!repoJson.contains(packageId, version)) {
          repoJson.addPackage(packageJson);
        }
      } else {
        console.log(`skipping ${packageId} version ${version}`);
      }
    }
  }
}

repoJson.save();

function throws(e: unknown): never {
  throw e;
}

function includeVersion(version: string, config: PackageConfig): boolean {
  const parsedVersion = parseSemver(version);
  const versionPrerelease = !!parsedVersion.prerelease.length;

  // it's prerelease and not specified as included
  if (versionPrerelease && !config.prerelease) return false;

  if (config.range) {
    if (!testRange(parsedVersion, config.range)) return false;
  }

  return true;
}
