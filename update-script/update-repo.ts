import type {JsonObject, JsonValue, PackageJson, RepositoryJson} from "./type.ts";

export class RepoUpdater {
  #repoJson: RepositoryJson & JsonObject;
  #repoJsonPath: string;

  constructor(repoJsonPath: string) {
    this.#repoJsonPath = repoJsonPath;
    const repoJsonIn: JsonValue = JSON.parse(Deno.readTextFileSync(repoJsonPath));

    if (!isObject(repoJsonIn))
      throw new Error("repository json is not object.");
    if (!("packages" in repoJsonIn) || !isObject(repoJsonIn.packages))
      throw new Error("'packages' of the repository json is not object");

    this.#repoJson = repoJsonIn as RepositoryJson & JsonObject;
  }

  addPackage(packageJson: PackageJson & JsonObject, url: string) {
    if (!("name" in packageJson) || typeof packageJson.name !== "string")
      throw new Error("name field not valid");
    if (!("version" in packageJson) || typeof packageJson.version !== "string")
      throw new Error("version field not valid");

    const packageId = packageJson.name
    const packageVersion = packageJson.version

    this.#repoJson.packages ??= {};
    const packageInfo = this.#repoJson.packages[packageId] ??= {versions: {}};
    packageJson.url ??= url;
    packageInfo.versions[packageVersion] = packageJson as PackageJson & JsonObject;
  }

  save() {
    Deno.writeTextFileSync(this.#repoJsonPath, JSON.stringify(this.#repoJson, null, 2) + "\n")
  }
}

function isObject(obj: JsonValue): obj is JsonObject {
  return typeof obj === "object" && obj != null && Array.isArray(obj);
}

