import {Octokit as OctokitCore} from "https://esm.sh/@octokit/core?dts";
import {restEndpointMethods} from "https://esm.sh/@octokit/plugin-rest-endpoint-methods?dts";
import * as JSON5 from "https://deno.land/x/json5@v1.0.0/mod.ts";

const Octokit = OctokitCore.plugin(restEndpointMethods);

interface Settings {
  sources: SourceRepo[],
  author: string,
  name: string,
  id: string,
  url: string,
  repo_output: string,
  formatted?: boolean,
}

interface SourceRepo {
  url: string,
  author: Person,
  registerer?: Person,
  packages: string[],
  skip_remove_check?: boolean,
}

type Person = PersonObj | string;

interface PersonObj {
  name: string,
  github?: string,
  contact: string,
}

interface RepoJson {
  packages: Record<string, RepoPackage>,
  author: string,
  name: string,
  id: string,
  url: string,
}

interface RepoPackage {
  versions: Record<string, PackageJson>,
}

interface PackageJson {
  curated_extra?: CuratedExtraInfo,
  name: string,
  version: string,
  url: string,
  vpmDependencies?: { [pkg: string]: string },
}

interface CuratedExtraInfo {
  changed_reported?: true,
  removed_reported?: true,
}

async function main() {
  const settings = JSON5.parse(new TextDecoder().decode(await Deno.readFile(Deno.args[0]))) as Settings;
  const oldRepo = JSON5.parse(new TextDecoder().decode(await Deno.readFile(settings.repo_output))) as Partial<RepoJson>;
  const repo = await makeRepository(settings, oldRepo);
  const repoJson = JSON.stringify(repo, null, settings.formatted ? '  ' : undefined);
  const [write, hasErr] = await Promise.allSettled([
    Deno.writeFile(settings.repo_output, new TextEncoder().encode(repoJson)),
    processErrors(settings),
  ]);

  let err = false;

  if (write.status == "rejected") {
    console.error(write.reason);
    err = true;
  }

  if (hasErr.status == "rejected") {
    console.error(hasErr.reason);
    err = true;
  } else if (!hasErr.value) {
    err = true;
  }

  // should exit with zero
  // if (err) Deno.exit(1);
}

async function makeRepository(settings: Settings, oldRepo: Partial<RepoJson>) {
  const allPackages = new Set(settings.sources.flatMap(x => x.packages));

  // packages by official repository
  allPackages.add("com.vrchat.avatars")
  allPackages.add("com.vrchat.base")
  allPackages.add("com.vrchat.worlds")
  allPackages.add("com.vrchat.core.vpm-resolver")
  // packages by curated repository
  allPackages.add("com.llealloo.audiolink")
  allPackages.add("dev.onevr.vrworldtoolkit")
  allPackages.add("vrchat.jordo.easyquestswitch")
  allPackages.add("dev.vrlabs.av3manager")
  allPackages.add("vrchat.blackstartx.gesture-manager")
  allPackages.add("com.vrchat.clientsim")
  allPackages.add("com.vrchat.udonsharp")

  const packagesList = await Promise.all(settings.sources.map(repo => processRepo(repo, allPackages, oldRepo)))
    .then(x => x.flatMap(y => y));

  packagesList.sort((a, b) => cmpString(a[0], b[0]))

  const packages: Record<string, RepoPackage> = {}

  for (const [packageId, pkg] of packagesList)
    packages[packageId] = pkg;

  // build repo
  return {
    packages: packages,
    author: settings.author,
    name: settings.name,
    id: settings.id,
    url: settings.url,
  } satisfies RepoJson;
}

async function processRepo(repo: SourceRepo, allPackages: Set<string>, oldRepo: Partial<RepoJson>): Promise<[string, RepoPackage][]> {
  let response: RepoJson;
  try {
    response = await fetch(repo.url).then(x => x.json());
  } catch (e) {
    repoError(repo, `Error downloading repo: ${e.message}`);
    return [];
  }
  const packages: [string, RepoPackage][] = [];

  for (const packageId of repo.packages) {
    const pkg = response.packages[packageId];
    if (pkg == null || pkg.versions == null) {
      repoError(repo, `Package ${packageId} not found`);
      packages.push([packageId, oldRepo.packages?.[packageId] ?? {versions: {}}]);
      break
    }

    const packagesSorted = await processAPackage(repo, pkg, packageId, oldRepo.packages?.[packageId], allPackages);

    const versions: Record<string, PackageJson> = {};

    for (const packageJson of packagesSorted) {
      versions[packageJson.version] = packageJson
    }

    packages.push([packageId, {versions}]);
  }

  return packages;
}

async function processAPackage(
  repo: SourceRepo,
  pkg: RepoPackage,
  packageId: string,
  oldRepo: RepoPackage | null | undefined,
  allPackages: Set<string>,
): Promise<PackageJson[]> {
  const jsonOptionals = await Promise.all(
    Object.entries(pkg.versions).map(([versionName, json]) =>
      processAPackageVersion(repo, json, packageId, versionName, oldRepo?.versions?.[versionName], allPackages)));

  const jsons = jsonOptionals.filter((x): x is NonNullable<typeof x> => x != null);

  const versions = new Set(jsons.map(x => x.version));

  // check for deletion.
  if (oldRepo?.versions && !repo.skip_remove_check) {
    for (const [version, pkg] of Object.entries(oldRepo.versions)) {
      if (!versions.has(version)) {
        // the version is removed
        if (!pkg.curated_extra?.removed_reported) {
          repoError(repo, `Package ${packageId} version ${version} is removed`);
        }
        (pkg.curated_extra ??= {}).removed_reported = true;

        jsons.push(pkg);
      }
    }
  }

  jsons.sort((a, b) => cmpSemVerStable(a.version, b.version));

  return jsons;
}

async function processAPackageVersion(
  repo: SourceRepo,
  json: PackageJson,
  packageId: string,
  versionName: string,
  oldRepo: PackageJson | null | undefined,
  allPackages: Set<string>,
  ): Promise<PackageJson | null | undefined> {
  if (!versionName.match(versionRegex)) {
    console.warn(`Skipping ${packageId} version ${versionName} because it's not stable`)
    return null
  }

  if (versionName != json.version || packageId != json.name) {
    repoError(repo, `Package ${packageId} version ${versionName} mismatch`);
    return oldRepo
  }

  if (json.vpmDependencies) {
    const missingDeps = Object.keys(json.vpmDependencies).filter(x => !allPackages.has(x));
    if (missingDeps.length != 0) {
      repoError(repo, `Package ${packageId} version ${versionName} has missing dependencies: ${missingDeps.join(", ")}`);
      return oldRepo
    }
  }

  const response = await fetch(json.url);
  if (!response.ok) {
    repoError(repo, `Package ${packageId} version ${versionName} url returns non-ok response code: ${response.status}`);
    return oldRepo;
  }

  if (oldRepo != null) {
    // updating package: verify unchanged except for url.
    type PackageWithoutUrl = Omit<PackageJson, 'url'> & Partial<Pick<PackageJson, 'url'>>;
    const clonedOldRepo: PackageWithoutUrl = Object.assign({}, oldRepo);
    delete clonedOldRepo.curated_extra;
    delete clonedOldRepo.url;
    const clonedJson: PackageWithoutUrl = Object.assign({}, json);
    delete clonedJson.url;

    const differs = findDifferProps(clonedOldRepo, clonedJson);
    if (differs.length != 0) {
      if (!oldRepo.curated_extra?.changed_reported) {
        repoError(repo, `Package ${packageId} version ${versionName} some attributes changed: ${differs.join(', ')}`);
      }
      (oldRepo.curated_extra ??= {}).changed_reported = true;
      return oldRepo;
    }
  }

  // the json is good. use the json
  return json;
}

///// utilities

const versionRegex = /^(?<maj>0|[1-9]\d*)\.(?<min>0|[1-9]\d*)\.(?<pat>0|[1-9]\d*)$/;

function findDifferProps(a: unknown, b: unknown): string[] {
  let changed: string[] = [];

  function impl(a: unknown, b: unknown, path: string) {
    if (a === b) return true;
    if (a == null || b == null || typeof a !== "object" || typeof b !== "object") {
      changed.push(path);
      return
    }

    const aKeys = new Set(Object.keys(a));
    const bKeys = new Set(Object.keys(b));

    for (const key of aKeys) {
      if (!bKeys.has(key)) {
        changed.push(`${path}.${key}`);
      }
      bKeys.delete(key)
      // @ts-ignore: property existence is checked with keys
      impl(a[key], b[key], `${path}.${key}`)
    }

    for (let key of bKeys) {
      changed.push(`${path}.${key}`);
    }

    return true;
  }

  impl(a, b, '');

  return changed;
}

function cmpString(x: string, y: string): -1 | 0 | 1 {
  if (x < y) return -1;
  if (x > y) return 1;
  return 0;
}

function cmpSemVerStable(a: string, b: string): -1 | 0 | 1 {
  const aParsed = a.match(versionRegex) ?? throws(new Error("a is not semver"));
  const bParsed = b.match(versionRegex) ?? throws(new Error("a is not semver"));

  const maj = cmp(aParsed.groups!.maj, bParsed.groups!.maj);
  if (maj != 0) return maj;
  const min = cmp(aParsed.groups!.min, bParsed.groups!.min);
  if (min != 0) return min;
  const pat = cmp(aParsed.groups!.pat, bParsed.groups!.pat);
  if (pat != 0) return pat;

  return 0;

  function cmp(aStr: string, bStr: string): -1 | 0 | 1 {
    const a = parseInt(aStr);
    const b = parseInt(bStr);
    if (a < b) return -1;
    if (a > b) return 1;
    return 0;
  }
}

function throws(a: unknown): never {
  throw a
}

///// end of utilities

type Error = { repo: SourceRepo, msg: string }

const errors: Error[] = [];

async function processErrors(_settings: Settings) {
  if (errors.length == 0) return true;
  const date = new Date().toUTCString();
  let message = `There are following errors building the repository at ${date}\n`;
  if (Deno.env.has("GITHUB_REPOSITORY") && Deno.env.has("GITHUB_RUN_ID")) {
    const server = Deno.env.get("GITHUB_SERVER_URL") ?? "https://github.com";
    const repo = Deno.env.get("GITHUB_REPOSITORY");
    const run_id = Deno.env.get("GITHUB_RUN_ID");
    message += `link to actions run [here](${server}/${repo}/actions/runs/${run_id})\n`;
  }
  message += `\n`;

  const parsePerson = (person: string): PersonObj => {
    const regex = /\s*(?<name>[^<]+?)\s*<(?<contact>[^>]+)>\s*(@(?<github>[a-zA-Z0-9_-]+)\s*)?/;
    const match = person.match(regex);
    if (match == null) throw new Error("invalid person")
    return {
      name: match.groups!.name,
      contact: match.groups!.contact,
      github: match.groups!.github,
    }
  }

  const personToString = (personIn: Person): string => {
    const person = typeof personIn == "string" ? parsePerson(personIn) : personIn;
    if (person.github)
      return `[${person.name}](${person.contact}) (\`@${person.github}\`)`;
    return `[${person.name}](${person.contact})`;
  };

  for (const error of errors) {
    message += `- ${error.msg}\n\n  repo: ${error.repo.url} by ${personToString(error.repo.author)}`
    if (error.repo.registerer)
      message += ` registered by ${personToString(error.repo.registerer)}`;
    message += `\n`;
  }

  console.log(message)

  if (Deno.env.has("GITHUB_TOKEN")) {
    // use octokit
    const octokit = new Octokit({
      auth: Deno.env.get("GITHUB_TOKEN"),
      baseUrl: Deno.env.get("GITHUB_API_URL"),
    });
    const repository = Deno.env.get("GITHUB_REPOSITORY");
    if (!repository) throw new Error("no GITHUB_REPOSITORY is not set");
    if (!repository) throw new Error("no GITHUB_REPOSITORY_OWNER is set");
    const owner = repository.split('/')[0];
    const repo = repository.split('/')[1];

    const {data: exists} = await octokit.rest.search.issuesAndPullRequests({q: `is:issue is:open label:curated-failure repo:"${repository}"`});
    if (exists.items.length) {
      // add comment
      await octokit.rest.issues.createComment({
        owner, repo,
        body: message,
        issue_number: exists.items[0].number,
      });
    } else {
      await octokit.rest.issues.create({
        owner, repo,
        title: `Curation update failure at ${date}`,
        body: message,
        labels: ['curated-failure'],
      });
    }
  }
  return false;
}

function repoError(repo: SourceRepo, msg: string) {
  errors.push({repo, msg});
}

await main();
