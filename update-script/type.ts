export type JsonValue = string | number | null | JsonObject | JsonValue[];

export interface JsonObject {
  [p: string]: JsonValue;
}

export interface RepositoryJson {
  packages: Record<string, PackageInformation & JsonObject>
}

export interface PackageInformation {
  versions: Record<string, PackageJson & JsonObject>
}

export interface PackageJson {
  name: string,
  version: string,
  url?: string,
  zipSHA256?: string,
}
