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

  addPackage(packageJson: PackageJson & JsonObject, url?: string, sha256Digit?: string) {
    if (!("name" in packageJson) || typeof packageJson.name !== "string")
      throw new Error("name field not valid");
    if (!("version" in packageJson) || typeof packageJson.version !== "string")
      throw new Error("version field not valid");

    const packageId = packageJson.name
    const packageVersion = packageJson.version

    this.#repoJson.packages ??= {};
    const packageInfo = this.#repoJson.packages[packageId] ??= {versions: {}};
    if (url) packageJson.url = url;
    if (sha256Digit) {
      if (packageJson.zipSHA256 && packageJson.zipSHA256 !== sha256Digit) {
        throw new Error("SHA256 is already set and different");
      }
      packageJson.zipSHA256 = sha256Digit;
    }
    packageInfo.versions[packageVersion] = packageJson as PackageJson & JsonObject;
  }

  save() {
    Deno.writeTextFileSync(this.#repoJsonPath, JSON.stringify(this.#repoJson, null, 2) + "\n")
  }

  contains(packageId: string, version: string): boolean {
    return this.#repoJson.packages[packageId]?.versions?.[version] != null;
  }
}

function isObject(obj: JsonValue): obj is JsonObject {
  return typeof obj === "object" && obj != null && !Array.isArray(obj);
}

