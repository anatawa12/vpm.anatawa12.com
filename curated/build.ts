import { Octokit, App } from "https://cdn.skypack.dev/octokit?dts";
import * as JSON5 from "https://deno.land/x/json5@v1.0.0/mod.ts";

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
}

interface Person {
  name: string,
  github?: string,
  contact: string,
}

interface RepoJson {
  packages: { [packageName: string]: RepoPackage },
  author: string,
  name: string,
  id: string,
  url: string,
}

interface RepoPackage {
  versions: { [version: string]: PackageJson },
}

interface PackageJson {
  name: string,
  version: string,
  url: string,
  vpmDependencies?: { [pkg: string]: string },
}

async function main() {
  const settings = JSON5.parse(new TextDecoder().decode(await Deno.readFile(Deno.args[0]))) as Settings;
  const repo = await makeRepository(settings);
  const repoJson = JSON.stringify(repo, null,  settings.formatted ? '  ' : undefined);
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

  if (err) Deno.exit(1);
}

async function makeRepository(settings: Settings) {
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

  const packagesList = await Promise.all(settings.sources.map(repo => processRepo(repo, allPackages)));
  const packages: { [packageName: string]: RepoPackage } = {}

  for (let packageJson of packagesList.flatMap(x => x)) {
    (packages[packageJson.name] ??= {versions: {}})
            .versions[packageJson.version] = packageJson;
  }

  // build repo
  return {
    packages: packages,
    author: settings.author,
    name: settings.name,
    id: settings.id,
    url: settings.url,
  } satisfies RepoJson;
}

async function processRepo(repo: SourceRepo, allPackages: Set<string>): Promise<PackageJson[]> {
  let response: RepoJson;
  try {
    response = await fetch(repo.url).then(x => x.json());
  } catch (e) {
    repoError(repo, `Error downloading repo: ${e.message}`);
    return [];
  }
  const packages: PackageJson[] = [];

  for (const packageId of repo.packages) {
    const versions = response.packages[packageId]?.versions;
    if (versions == null) {
      repoError(repo, `Package ${packageId} not found`);
      break
    }

    for (const [versionName, json] of Object.entries(versions)) {
      if (versionName != json.version || packageId != json.name) {
        repoError(repo,  `Package ${packageId} version ${versionName} mismatch`);
        continue
      }
      if (!versionName.match(/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/)) {
        console.warn(`Skipping ${packageId} version ${versionName} because it's not stable`)
        continue
      }

      if (json.vpmDependencies) {
        const missingDeps = Object.keys(json.vpmDependencies).filter(x => !allPackages.has(x));
        if (missingDeps.length != 0) {
          repoError(repo, `Package ${packageId} version ${versionName} has missing dependencies: ${missingDeps.join(", ")}`);
          continue
        }
      }

      packages.push(json);
    }
  }

  return packages;
}

type Error = { repo: SourceRepo, msg: string }

let errors: Error[] = [];

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
  for (const error of errors) {
    function personToString(person: Person): string {
      if (person.github)
        return `[${person.name}](${person.contact}) (\`@${person.github}\`)`;
      return `[${person.name}](${person.contact})`;
    }
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
    const owner =  repository.split('/')[0];
    const repo =  repository.split('/')[1];

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
