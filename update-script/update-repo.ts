
export class RepoUpdater {
  #repoJson: Record<string, unknown> & Record<"packages", Record<string, Partial<Record<"versions", any>>>>;
  #repoJsonPath: string;

  constructor(repoJsonPath: string) {
    this.#repoJsonPath = repoJsonPath;
    const repoJsonIn: unknown = JSON.parse(Deno.readTextFileSync(repoJsonPath));

    if (typeof repoJsonIn !== "object" || !repoJsonIn)
      throw new Error("repository json is not object.");
    if ("packages" in repoJsonIn && typeof repoJsonIn.packages !== "object")
      throw new Error("'packages' of the repository json is not object");

    this.#repoJson = repoJsonIn as Record<string, unknown> & Record<'packages', Record<string, Partial<Record<'versions', any>>>>;
  }

  addPackage(packageJson: object, url: string) {
    if (!("name" in packageJson) || typeof packageJson.name !== "string")
      throw new Error("name field not valid");
    if (!("version" in packageJson) || typeof packageJson.version !== "string")
      throw new Error("version field not valid");

    const packageId = packageJson.name
    const packageVersion = packageJson.version

    this.#repoJson.packages ??= {};
    const packageInfo = this.#repoJson.packages[packageId] ??= {}
    if (typeof packageInfo !== "object")
      throw new Error(`packages["${packageId}"] is not object`);
    packageInfo.versions ??= {}
    if (typeof packageInfo.versions !== "object" || !packageInfo.versions)
      throw new Error(`packages["${packageId}"].versions is not object`);
    if (packageVersion in packageInfo.versions)
      throw new Error(`packages["${packageId}"].versions["${packageVersion}"] already exists`);
    (packageJson as any).url ??= url;
    packageInfo.versions[packageVersion] = packageJson;
  }

  save() {
    Deno.writeTextFileSync(this.#repoJsonPath, JSON.stringify(this.#repoJson, null, 2) + "\n")
  }
}

export function addPackage() {

}
